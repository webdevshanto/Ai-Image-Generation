import { randomUUID } from 'node:crypto';
import { VideoAssetType } from '../../generated/prisma/client.js';
import type { Plan, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';
import {
  deleteVideo,
  uploadVideoBuffer,
} from '../../services/cloudinary.service.js';
import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../utils/api-error.js';
import { MAX_VIDEO_BYTES } from '../../middleware/video-upload.js';
import { findGenerationPlan } from '../generations/generation.service.js';

const VIDEO_RESERVATION_TTL_MS = 30 * 60 * 1000;

async function findVideoPlan(
  client: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<Plan> {
  return findGenerationPlan(client, userId, now);
}

async function releaseVideoReservation(userId: string, reservationId: string) {
  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
    `;
    await transaction.videoUploadReservation.deleteMany({
      where: { id: reservationId, userId },
    });
  });
}

async function cleanupExpiredVideoReservations(userId: string, now: Date) {
  const expired = await prisma.videoUploadReservation.findMany({
    where: { userId, expiresAt: { lte: now } },
    select: { id: true, publicId: true },
  });
  for (const reservation of expired) {
    const result = await deleteVideo(reservation.publicId);
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new ExternalServiceError(
        'An expired video upload could not be cleaned up',
      );
    }
    await releaseVideoReservation(userId, reservation.id);
  }
}

export async function uploadUserVideo(
  userId: string,
  file?: Express.Multer.File,
) {
  if (!file) throw new ValidationError('Choose an MP4 video file');
  if (!file.buffer.length || file.buffer.length > MAX_VIDEO_BYTES) {
    throw new ValidationError('Video must be between 1 byte and 25 MB');
  }
  const now = new Date();
  await cleanupExpiredVideoReservations(userId, now);
  const id = randomUUID();
  const publicId = `ai-image-generator/users/${userId}/videos/${id}`;

  await prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;
      const plan = await findVideoPlan(transaction, userId, now);
      const [assetsCount, reservationCount, pendingVideoGenerations] =
        await Promise.all([
          transaction.videoAsset.count({
            where: { userId },
          }),
          transaction.videoUploadReservation.count({ where: { userId } }),
          transaction.generationJob.count({
            where: {
              userId,
              mode: {
                in: ['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'VIDEO_TO_VIDEO'],
              },
              status: { in: ['QUEUED', 'PROCESSING'] },
            },
          }),
        ]);
      if (
        assetsCount + reservationCount + pendingVideoGenerations >=
        plan.libraryVideoLimit
      ) {
        throw new ConflictError('Video library limit reached', {
          limit: plan.libraryVideoLimit,
          used: assetsCount + reservationCount + pendingVideoGenerations,
        });
      }
      await transaction.videoUploadReservation.create({
        data: {
          id,
          userId,
          publicId,
          fileSizeBytes: file.buffer.length,
          expiresAt: new Date(now.getTime() + VIDEO_RESERVATION_TTL_MS),
        },
      });
    },
    { maxWait: 30_000, timeout: 30_000 },
  );

  let uploaded: Awaited<ReturnType<typeof uploadVideoBuffer>>;
  try {
    uploaded = await uploadVideoBuffer(file.buffer, publicId);
  } catch (error) {
    try {
      const cleanup = await deleteVideo(publicId);
      if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
        throw new ExternalServiceError('Video upload cleanup failed');
      }
      await releaseVideoReservation(userId, id);
    } catch (cleanupError) {
      console.error(
        '[ERROR] Video upload reservation retained for cleanup',
        cleanupError,
      );
    }
    throw error;
  }

  if (uploaded.public_id !== publicId) {
    try {
      const cleanup = await deleteVideo(uploaded.public_id);
      if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
        throw new ExternalServiceError('Unexpected video cleanup failed');
      }
      await releaseVideoReservation(userId, id);
    } catch (cleanupError) {
      console.error(
        '[ERROR] Unexpected Cloudinary video cleanup failed',
        cleanupError,
      );
    }
    throw new ExternalServiceError(
      'Cloudinary returned an unexpected video identifier',
    );
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const video = await transaction.videoAsset.create({
        data: {
          userId,
          type: VideoAssetType.SOURCE,
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          format: 'mp4',
          fileSizeBytes: file.buffer.length,
        },
        select: {
          id: true,
          type: true,
          url: true,
          format: true,
          fileSizeBytes: true,
          createdAt: true,
        },
      });
      await transaction.videoUploadReservation.delete({ where: { id } });
      return video;
    });
  } catch (error) {
    try {
      const cleanup = await deleteVideo(uploaded.public_id);
      if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
        throw new ExternalServiceError('Unrecorded video cleanup failed');
      }
      await releaseVideoReservation(userId, id);
    } catch (cleanupError) {
      console.error('[ERROR] Unrecorded video cleanup failed', cleanupError);
      throw new ExternalServiceError(
        'Video metadata could not be saved and cleanup failed',
      );
    }
    throw error;
  }
}

export async function listUserVideos(userId: string) {
  const [videos, savedCount, plan, reservations, activeGenerations] =
    await Promise.all([
      prisma.videoAsset.findMany({
        where: { userId, deletionPending: false },
        select: {
          id: true,
          generationId: true,
          type: true,
          url: true,
          format: true,
          fileSizeBytes: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.videoAsset.count({ where: { userId } }),
      findGenerationPlan(prisma, userId, new Date()),
      prisma.videoUploadReservation.count({ where: { userId } }),
      prisma.generationJob.count({
        where: {
          userId,
          mode: { in: ['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'VIDEO_TO_VIDEO'] },
          status: { in: ['QUEUED', 'PROCESSING'] },
        },
      }),
    ]);
  const used = savedCount + reservations + activeGenerations;
  return {
    videos,
    library: {
      used,
      limit: plan.libraryVideoLimit,
      remaining: Math.max(0, plan.libraryVideoLimit - used),
      saved: savedCount,
      pending: reservations + activeGenerations,
      maxFileSizeBytes: MAX_VIDEO_BYTES,
    },
  };
}

export async function getUserVideo(userId: string, videoId: string) {
  const video = await prisma.videoAsset.findFirst({
    where: { id: videoId, userId, deletionPending: false },
    select: {
      id: true,
      generationId: true,
      type: true,
      url: true,
      format: true,
      fileSizeBytes: true,
      createdAt: true,
    },
  });
  if (!video) throw new NotFoundError('Video not found');
  return video;
}

export async function deleteUserVideo(userId: string, videoId: string) {
  const video = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
    `;
    const asset = await transaction.videoAsset.findFirst({
      where: { id: videoId, userId },
      select: { id: true, publicId: true },
    });
    if (!asset) throw new NotFoundError('Video not found');
    const activeGenerations = await transaction.generationJob.count({
      where: {
        userId,
        sourceVideoId: videoId,
        status: { in: ['QUEUED', 'PROCESSING'] },
      },
    });
    if (activeGenerations > 0) {
      throw new ConflictError('Video is being used by an active generation');
    }
    if (
      !(await transaction.videoAsset.findFirst({
        where: { id: asset.id, deletionPending: true },
        select: { id: true },
      }))
    ) {
      await transaction.videoAsset.update({
        where: { id: asset.id },
        data: { deletionPending: true },
      });
    }
    return asset;
  });
  const result = await deleteVideo(video.publicId);
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new ExternalServiceError(
      'Cloudinary could not delete the video; retry deletion using the same video ID',
    );
  }
  await prisma.videoAsset.delete({ where: { id: video.id } });
}
