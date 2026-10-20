import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { GenerationStatus } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { env, getGeminiApiKey } from '../config/env.js';
import { inspectUploadedImage } from '../modules/images/image.validation.js';
import { generateGeminiImage } from '../modules/generations/gemini-image.service.js';
import { generateGeminiVideo } from '../modules/generations/gemini-video.service.js';
import { refundFailedGeneration } from '../modules/credits/credit.service.js';
import { findGenerationPlan } from '../modules/generations/generation.service.js';
import { MAX_VIDEO_BYTES } from '../middleware/video-upload.js';
import {
  deleteVideo,
  deleteImage,
  isCloudinaryConfigured,
  uploadImageBuffer,
  uploadVideoBuffer,
} from '../services/cloudinary.service.js';
import { ExternalServiceError, NotFoundError } from '../utils/api-error.js';
import {
  createGenerationWorker,
  type GenerationJobData,
} from './generation.queue.js';

let worker: ReturnType<typeof createGenerationWorker> | undefined;

async function loadSourceImage(userId: string, imageId: string) {
  const source = await prisma.imageAsset.findFirst({
    where: { id: imageId, userId, deletionPending: false },
    select: { url: true },
  });
  if (!source) throw new NotFoundError('Source image not found');

  const sourceUrl = new URL(source.url);
  if (
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.hostname !== 'res.cloudinary.com'
  ) {
    throw new ExternalServiceError('Source image storage URL is invalid');
  }

  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(env.GENERATION_TIMEOUT_MS),
    });
  } catch {
    throw new ExternalServiceError('Source image could not be downloaded');
  }
  if (!response.ok) {
    throw new ExternalServiceError('Source image could not be downloaded');
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 10 * 1024 * 1024) {
    throw new ExternalServiceError('Source image exceeds the allowed size');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ExternalServiceError('Source image response was empty');
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > 10 * 1024 * 1024) {
      await reader.cancel();
      throw new ExternalServiceError('Source image exceeds the allowed size');
    }
    chunks.push(Buffer.from(value));
  }
  const image = Buffer.concat(chunks);
  const metadata = await inspectUploadedImage(image);
  return { buffer: image, mimeType: metadata.mimeType };
}

async function loadSourceVideo(userId: string, videoId: string) {
  const source = await prisma.videoAsset.findFirst({
    where: { id: videoId, userId, deletionPending: false },
    select: { url: true },
  });
  if (!source) throw new NotFoundError('Source video not found');

  const sourceUrl = new URL(source.url);
  if (
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.hostname !== 'res.cloudinary.com'
  ) {
    throw new ExternalServiceError('Source video storage URL is invalid');
  }

  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(env.GENERATION_TIMEOUT_MS),
    });
  } catch {
    throw new ExternalServiceError('Source video could not be downloaded');
  }
  if (!response.ok) {
    throw new ExternalServiceError('Source video could not be downloaded');
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_BYTES) {
    throw new ExternalServiceError('Source video exceeds the 25 MB limit');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ExternalServiceError('Source video response was empty');
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_VIDEO_BYTES) {
      await reader.cancel();
      throw new ExternalServiceError('Source video exceeds the 25 MB limit');
    }
    chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks);
  const type = await fileTypeFromBuffer(buffer);
  if (!type || type.ext !== 'mp4' || type.mime !== 'video/mp4') {
    throw new ExternalServiceError('Source video is not a valid MP4');
  }
  return { buffer, mimeType: 'video/mp4' };
}

async function processVideoGeneration(job: {
  data: GenerationJobData;
  attemptsMade: number;
  opts: { attempts?: number };
}) {
  const { generationId, userId, prompt, sourceImageId, sourceVideoId } =
    job.data;
  const aspectRatio = job.data.aspectRatio === '9:16' ? '9:16' : '16:9';
  await prisma.generationJob.update({
    where: { id: generationId },
    data: {
      status: GenerationStatus.PROCESSING,
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });

  let publicId: string | undefined;
  try {
    const sourceImage = sourceImageId
      ? await loadSourceImage(userId, sourceImageId)
      : undefined;
    const sourceVideo = sourceVideoId
      ? await loadSourceVideo(userId, sourceVideoId)
      : undefined;
    const generated = await generateGeminiVideo({
      prompt,
      aspectRatio,
      ...(sourceImage ? { sourceImage } : {}),
      ...(sourceVideo ? { sourceVideo } : {}),
    });
    const videoType = await fileTypeFromBuffer(generated.buffer);
    if (!videoType || videoType.ext !== 'mp4') {
      throw new ExternalServiceError('Gemini output is not a valid MP4 video');
    }

    publicId = `ai-image-generator/users/${userId}/generations/${generationId}-${randomUUID()}`;
    const uploaded = await uploadVideoBuffer(generated.buffer, publicId);
    if (uploaded.public_id !== publicId) {
      const cleanup = await deleteVideo(uploaded.public_id);
      if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
        throw new ExternalServiceError(
          'Unexpected Cloudinary video could not be cleaned up',
        );
      }
      throw new ExternalServiceError(
        'Cloudinary returned an unexpected video identifier',
      );
    }

    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
        `;
        const plan = await findGenerationPlan(transaction, userId, new Date());
        const [assetsCount, reservationsCount, activeCount] = await Promise.all(
          [
            transaction.videoAsset.count({
              where: { userId },
            }),
            transaction.videoUploadReservation.count({ where: { userId } }),
            transaction.generationJob.count({
              where: {
                userId,
                id: { not: generationId },
                mode: {
                  in: ['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'VIDEO_TO_VIDEO'],
                },
                status: {
                  in: ['QUEUED', 'PROCESSING'],
                },
              },
            }),
          ],
        );
        if (
          assetsCount + reservationsCount + activeCount >=
          plan.libraryVideoLimit
        ) {
          throw new ExternalServiceError(
            'Video library capacity is no longer available',
          );
        }
        await transaction.videoAsset.create({
          data: {
            userId,
            generationId,
            type: 'RESULT',
            url: uploaded.secure_url,
            publicId: uploaded.public_id,
            format: 'mp4',
            fileSizeBytes: generated.buffer.length,
          },
        });
        await transaction.generationJob.update({
          where: { id: generationId },
          data: {
            status: GenerationStatus.COMPLETED,
            completedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
      });
    } catch (error) {
      const cleanup = await deleteVideo(uploaded.public_id);
      if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
        throw new ExternalServiceError(
          'Generated video could not be recorded or cleaned up',
        );
      }
      throw error;
    }
  } catch (error) {
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isFinalAttempt) {
      await prisma.generationJob.update({
        where: { id: generationId },
        data: {
          status: GenerationStatus.FAILED,
          errorCode: 'GENERATION_FAILED',
          errorMessage: 'Video generation could not be completed',
          completedAt: new Date(),
        },
      });
      await refundFailedGeneration(userId, generationId);
    } else {
      await prisma.generationJob.update({
        where: { id: generationId },
        data: { status: GenerationStatus.QUEUED },
      });
    }

    if (publicId) {
      try {
        const existing = await prisma.videoAsset.findFirst({
          where: { generationId, publicId },
          select: { id: true },
        });
        if (!existing) {
          const cleanup = await deleteVideo(publicId);
          if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
            throw new ExternalServiceError(
              'Failed video cleanup did not complete',
            );
          }
        }
      } catch (cleanupError) {
        console.error(
          `[ERROR] Generated video cleanup failed for job ${generationId}`,
          cleanupError,
        );
      }
    }
    throw error;
  }
}

async function processGeneration(job: {
  data: GenerationJobData;
  attemptsMade: number;
  opts: { attempts?: number };
}) {
  if (
    job.data.mode === 'text-to-video' ||
    job.data.mode === 'image-to-video' ||
    job.data.mode === 'video-to-video'
  ) {
    return processVideoGeneration(job);
  }

  const { generationId, userId, prompt, sourceImageId, aspectRatio } = job.data;
  await prisma.generationJob.update({
    where: { id: generationId },
    data: {
      status: GenerationStatus.PROCESSING,
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });

  let uploadedPublicId: string | undefined;
  try {
    const sourceImage = sourceImageId
      ? await loadSourceImage(userId, sourceImageId)
      : undefined;
    const generated = await generateGeminiImage({
      prompt,
      aspectRatio,
      ...(sourceImage ? { sourceImage } : {}),
    });
    const metadata = await inspectUploadedImage(generated.buffer);
    if (metadata.mimeType !== generated.mimeType) {
      throw new ExternalServiceError(
        'Gemini returned an image with inconsistent content type',
      );
    }

    uploadedPublicId = `ai-image-generator/users/${userId}/generations/${generationId}-${randomUUID()}`;
    const uploaded = await uploadImageBuffer(
      generated.buffer,
      uploadedPublicId,
      metadata.format === 'jpeg' ? 'jpg' : metadata.format,
    );
    if (uploaded.public_id !== uploadedPublicId) {
      const cleanup = await deleteImage(uploaded.public_id);
      if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
        throw new ExternalServiceError(
          'Cloudinary returned an unexpected image identifier and cleanup failed',
        );
      }
      throw new ExternalServiceError(
        'Cloudinary returned an unexpected image identifier',
      );
    }

    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
        `;
        const entitledPlan = await findGenerationPlan(
          transaction,
          userId,
          new Date(),
        );
        const [
          assetCount,
          uploadReservationCount,
          otherGenerationCount,
          assets,
          uploads,
        ] = await Promise.all([
          transaction.imageAsset.count({ where: { userId } }),
          transaction.imageUploadReservation.count({ where: { userId } }),
          transaction.generationJob.count({
            where: {
              userId,
              id: { not: generationId },
              mode: { in: ['TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE'] },
              status: {
                in: ['QUEUED', 'PROCESSING'],
              },
            },
          }),
          transaction.imageAsset.aggregate({
            where: { userId },
            _sum: { fileSizeBytes: true },
          }),
          transaction.imageUploadReservation.aggregate({
            where: { userId },
            _sum: { fileSizeBytes: true },
          }),
        ]);
        if (
          assetCount + uploadReservationCount + otherGenerationCount >=
          entitledPlan.libraryImageLimit
        ) {
          throw new ExternalServiceError(
            'Image library capacity is no longer available',
          );
        }
        const occupiedStorage =
          (assets._sum.fileSizeBytes ?? 0) +
          (uploads._sum.fileSizeBytes ?? 0) +
          otherGenerationCount * 10 * 1024 * 1024;
        if (
          occupiedStorage + generated.buffer.length >
          entitledPlan.imageStorageLimitBytes
        ) {
          throw new ExternalServiceError(
            'Image storage capacity is no longer available',
          );
        }
        await transaction.imageAsset.create({
          data: {
            userId,
            generationId,
            type: 'RESULT',
            url: uploaded.secure_url,
            publicId: uploaded.public_id,
            format: metadata.format,
            width: metadata.width,
            height: metadata.height,
            fileSizeBytes: generated.buffer.length,
          },
        });
        await transaction.generationJob.update({
          where: { id: generationId },
          data: {
            status: GenerationStatus.COMPLETED,
            completedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
      });
    } catch (error) {
      const deleted = await deleteImage(uploaded.public_id);
      if (deleted.result !== 'ok' && deleted.result !== 'not found') {
        throw new ExternalServiceError(
          'Generated image could not be recorded or cleaned up',
        );
      }
      throw error;
    }
  } catch (error) {
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isFinalAttempt) {
      await prisma.generationJob.update({
        where: { id: generationId },
        data: {
          status: GenerationStatus.FAILED,
          errorCode: 'GENERATION_FAILED',
          errorMessage: 'Image generation could not be completed',
          completedAt: new Date(),
        },
      });
      await refundFailedGeneration(userId, generationId);
    } else {
      await prisma.generationJob.update({
        where: { id: generationId },
        data: { status: GenerationStatus.QUEUED },
      });
    }

    if (uploadedPublicId) {
      try {
        const existing = await prisma.imageAsset.findFirst({
          where: { generationId, publicId: uploadedPublicId },
          select: { id: true },
        });
        if (!existing) {
          const result = await deleteImage(uploadedPublicId);
          if (result.result !== 'ok' && result.result !== 'not found') {
            throw new ExternalServiceError(
              'Failed generated image cleanup did not complete',
            );
          }
        }
      } catch (cleanupError) {
        console.error(
          `[ERROR] Generated image cleanup failed for job ${generationId}`,
          cleanupError,
        );
      }
    }

    throw error;
  }
}

export function startGenerationWorker() {
  if (!getGeminiApiKey()) {
    console.warn('[WARN] Gemini key missing; image generation worker disabled');
    return;
  }
  if (!isCloudinaryConfigured()) {
    console.warn(
      '[WARN] Cloudinary is not configured; image generation worker disabled',
    );
    return;
  }
  if (worker) return;

  worker = createGenerationWorker(processGeneration);
  worker.on('error', (error) => {
    console.error(`[ERROR] Generation worker error: ${error.message}`);
  });
}

export async function closeGenerationWorker() {
  await worker?.close();
  worker = undefined;
}
