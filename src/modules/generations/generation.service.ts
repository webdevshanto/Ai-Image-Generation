import {
  AssetType,
  GenerationMode,
  GenerationStatus,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';
import type { Plan, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';
import { env, getGeminiApiKey } from '../../config/env.js';
import {
  getGenerationQueue,
  type GenerationJobData,
} from '../../queues/generation.queue.js';
import { isCloudinaryConfigured } from '../../services/cloudinary.service.js';
import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
} from '../../utils/api-error.js';
import { MAX_IMAGE_BYTES } from '../images/image.validation.js';
import {
  refundFailedGeneration,
  reserveGenerationCredit,
} from '../credits/credit.service.js';
import type { CreateGenerationInput } from './generation.schema.js';

export async function findGenerationPlan(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  now: Date,
): Promise<Plan> {
  const subscription = await client.subscription.findFirst({
    where: {
      userId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: { lte: now },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
      plan: { isActive: true, isComingSoon: false },
    },
    include: { plan: true },
    orderBy: { currentPeriodStart: 'desc' },
  });
  if (subscription) return subscription.plan;

  const freePlan = await client.plan.findUnique({ where: { slug: 'free' } });
  if (!freePlan?.isActive) {
    throw new NotFoundError('The Free plan is not configured');
  }
  return freePlan;
}

function generationMode(mode: CreateGenerationInput['mode']): GenerationMode {
  const modes: Record<CreateGenerationInput['mode'], GenerationMode> = {
    'text-to-image': GenerationMode.TEXT_TO_IMAGE,
    'image-to-image': GenerationMode.IMAGE_TO_IMAGE,
    'text-to-video': GenerationMode.TEXT_TO_VIDEO,
    'image-to-video': GenerationMode.IMAGE_TO_VIDEO,
    'video-to-video': GenerationMode.VIDEO_TO_VIDEO,
  };
  return modes[mode];
}

export async function createUserGeneration(
  userId: string,
  input: CreateGenerationInput,
) {
  if (!getGeminiApiKey()) {
    throw new ExternalServiceError('Gemini generation is not configured');
  }
  if (!isCloudinaryConfigured()) {
    throw new ExternalServiceError('Cloudinary is not configured');
  }
  const mode = generationMode(input.mode);
  const videoMode =
    mode === GenerationMode.TEXT_TO_VIDEO ||
    mode === GenerationMode.IMAGE_TO_VIDEO ||
    mode === GenerationMode.VIDEO_TO_VIDEO;
  const now = new Date();
  const generation = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
    `;
    if (
      input.sourceImageId &&
      !(await transaction.imageAsset.findFirst({
        where: {
          id: input.sourceImageId,
          userId,
          deletionPending: false,
        },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError('Source image not found in your library');
    }
    if (
      input.sourceVideoId &&
      !(await transaction.videoAsset.findFirst({
        where: {
          id: input.sourceVideoId,
          userId,
          deletionPending: false,
        },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError('Source video not found in your library');
    }
    const plan = await findGenerationPlan(transaction, userId, now);
    if (videoMode) {
      const [assetCount, reservationCount, activeCount] = await Promise.all([
        transaction.videoAsset.count({
          where: { userId },
        }),
        transaction.videoUploadReservation.count({ where: { userId } }),
        transaction.generationJob.count({
          where: {
            userId,
            mode: {
              in: [
                GenerationMode.TEXT_TO_VIDEO,
                GenerationMode.IMAGE_TO_VIDEO,
                GenerationMode.VIDEO_TO_VIDEO,
              ],
            },
            status: {
              in: [GenerationStatus.QUEUED, GenerationStatus.PROCESSING],
            },
          },
        }),
      ]);
      if (
        assetCount + reservationCount + activeCount >=
        plan.libraryVideoLimit
      ) {
        throw new ConflictError('Video library limit reached', {
          limit: plan.libraryVideoLimit,
          used: assetCount + reservationCount + activeCount,
        });
      }
    } else {
      const [
        assetCount,
        uploadReservationCount,
        activeGenerationCount,
        assets,
        uploads,
      ] = await Promise.all([
        transaction.imageAsset.count({ where: { userId } }),
        transaction.imageUploadReservation.count({ where: { userId } }),
        transaction.generationJob.count({
          where: {
            userId,
            mode: {
              in: [GenerationMode.TEXT_TO_IMAGE, GenerationMode.IMAGE_TO_IMAGE],
            },
            status: {
              in: [GenerationStatus.QUEUED, GenerationStatus.PROCESSING],
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
        assetCount + uploadReservationCount + activeGenerationCount >=
        plan.libraryImageLimit
      ) {
        throw new ConflictError('Image library limit reached', {
          limit: plan.libraryImageLimit,
          used: assetCount + uploadReservationCount + activeGenerationCount,
        });
      }
      const usedStorage =
        (assets._sum.fileSizeBytes ?? 0) +
        (uploads._sum.fileSizeBytes ?? 0) +
        activeGenerationCount * MAX_IMAGE_BYTES;
      if (usedStorage + MAX_IMAGE_BYTES > plan.imageStorageLimitBytes) {
        throw new ConflictError('Image storage limit reached', {
          limitBytes: plan.imageStorageLimitBytes,
          usedBytes: usedStorage,
          requestedBytes: MAX_IMAGE_BYTES,
        });
      }
    }

    return transaction.generationJob.create({
      data: {
        userId,
        mode,
        prompt: input.prompt,
        settings: { aspectRatio: input.aspectRatio },
        sourceVideoId: input.sourceVideoId,
        provider: 'google',
        model: videoMode ? env.GEMINI_VIDEO_MODEL : env.GEMINI_IMAGE_MODEL,
      },
      select: { id: true },
    });
  });

  try {
    await reserveGenerationCredit(userId, generation.id, mode);
  } catch (error) {
    await prisma.generationJob.update({
      where: { id: generation.id },
      data: {
        status: GenerationStatus.FAILED,
        errorCode: 'CREDIT_RESERVATION_FAILED',
        errorMessage: 'Generation could not be started',
        completedAt: new Date(),
      },
    });
    throw error;
  }

  const jobData: GenerationJobData = {
    generationId: generation.id,
    userId,
    mode: input.mode,
    prompt: input.prompt,
    ...(input.sourceImageId ? { sourceImageId: input.sourceImageId } : {}),
    ...(input.sourceVideoId ? { sourceVideoId: input.sourceVideoId } : {}),
    aspectRatio: input.aspectRatio,
  };

  try {
    await getGenerationQueue().add('generate-image', jobData, {
      jobId: generation.id,
    });
  } catch {
    await prisma.generationJob.update({
      where: { id: generation.id },
      data: {
        status: GenerationStatus.FAILED,
        errorCode: 'QUEUE_UNAVAILABLE',
        errorMessage: 'Generation could not be queued',
        completedAt: new Date(),
      },
    });
    await refundFailedGeneration(userId, generation.id);
    throw new ExternalServiceError('Generation queue is unavailable');
  }

  return { id: generation.id, status: GenerationStatus.QUEUED };
}

export async function getUserGeneration(userId: string, generationId: string) {
  const generation = await prisma.generationJob.findFirst({
    where: { id: generationId, userId },
    select: {
      id: true,
      mode: true,
      status: true,
      prompt: true,
      provider: true,
      model: true,
      errorCode: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      assets: {
        where: { type: AssetType.RESULT, deletionPending: false },
        select: {
          id: true,
          url: true,
          format: true,
          width: true,
          height: true,
          fileSizeBytes: true,
          createdAt: true,
        },
      },
      videoAssets: {
        where: { deletionPending: false },
        select: {
          id: true,
          type: true,
          url: true,
          format: true,
          fileSizeBytes: true,
          createdAt: true,
        },
      },
    },
  });

  if (!generation) throw new NotFoundError('Generation job not found');
  return generation;
}
