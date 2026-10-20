import {
  AssetType,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';
import type { Plan, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';
import { randomUUID } from 'node:crypto';
import {
  deleteImage,
  uploadImageBuffer,
} from '../../services/cloudinary.service.js';
import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../utils/api-error.js';
import { inspectUploadedImage } from './image.validation.js';
import { monthlyPeriodStart } from '../credits/credit-policy.js';

const MAX_PAGE_SIZE = 50;
const UPLOAD_RESERVATION_TTL_MS = 30 * 60 * 1000;

async function findImageQuotaPlan(
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
  if (!freePlan || !freePlan.isActive) {
    throw new NotFoundError('The Free plan is not configured');
  }
  return freePlan;
}

async function releaseUploadReservation(
  userId: string,
  reservation: { id: string; periodStart: Date },
) {
  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
    `;
    const removed = await transaction.imageUploadReservation.deleteMany({
      where: { id: reservation.id, userId },
    });
    if (removed.count === 0) return;

    const decremented = await transaction.imageUploadUsage.updateMany({
      where: {
        userId,
        periodStart: reservation.periodStart,
        uploads: { gt: 0 },
      },
      data: { uploads: { decrement: 1 } },
    });
    if (decremented.count !== 1) {
      throw new ExternalServiceError(
        'Image upload reservation could not be released',
      );
    }
  });
}

async function cleanExpiredUploadReservations(userId: string, now: Date) {
  const expired = await prisma.imageUploadReservation.findMany({
    where: { userId, expiresAt: { lte: now } },
    select: { id: true, publicId: true, periodStart: true },
  });

  for (const reservation of expired) {
    const result = await deleteImage(reservation.publicId);
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new ExternalServiceError(
        'An expired upload could not be cleaned up in Cloudinary',
      );
    }
    await releaseUploadReservation(userId, reservation);
  }
}

async function reserveImageUpload(
  userId: string,
  fileSizeBytes: number,
  now: Date,
) {
  const periodStart = monthlyPeriodStart(now);
  const reservationId = randomUUID();
  const publicId = `ai-image-generator/users/${userId}/uploads/${reservationId}`;

  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;

      const plan = await findImageQuotaPlan(transaction, userId, now);
      if (plan.monthlyImageUploads <= 0 || plan.imageStorageLimitBytes <= 0) {
        throw new ConflictError('Image uploads are not included in this plan');
      }

      const usage = await transaction.imageUploadUsage.upsert({
        where: { userId_periodStart: { userId, periodStart } },
        create: { userId, periodStart },
        update: {},
      });
      if (usage.uploads >= plan.monthlyImageUploads) {
        throw new ConflictError('Monthly image upload limit reached', {
          limit: plan.monthlyImageUploads,
          used: usage.uploads,
          resetsAt: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
          ),
        });
      }

      const [assets, reservations] = await Promise.all([
        transaction.imageAsset.aggregate({
          where: { userId },
          _sum: { fileSizeBytes: true },
        }),
        transaction.imageUploadReservation.aggregate({
          where: { userId },
          _sum: { fileSizeBytes: true },
        }),
      ]);
      const usedBytes =
        (assets._sum.fileSizeBytes ?? 0) +
        (reservations._sum.fileSizeBytes ?? 0);
      if (usedBytes + fileSizeBytes > plan.imageStorageLimitBytes) {
        throw new ConflictError('Image storage limit reached', {
          limitBytes: plan.imageStorageLimitBytes,
          usedBytes,
          requestedBytes: fileSizeBytes,
        });
      }

      await transaction.imageUploadReservation.create({
        data: {
          id: reservationId,
          userId,
          periodStart,
          fileSizeBytes,
          publicId,
          expiresAt: new Date(now.getTime() + UPLOAD_RESERVATION_TTL_MS),
        },
      });
      await transaction.imageUploadUsage.update({
        where: { id: usage.id },
        data: { uploads: { increment: 1 } },
      });

      return { id: reservationId, periodStart, publicId, usedBytes };
    },
    { maxWait: 30_000, timeout: 30_000 },
  );
}

export async function uploadUserImage(
  userId: string,
  file?: Express.Multer.File,
) {
  if (!file) {
    throw new ValidationError('Choose an image file in the image field');
  }

  const metadata = await inspectUploadedImage(file.buffer);
  const now = new Date();
  await cleanExpiredUploadReservations(userId, now);
  const reservation = await reserveImageUpload(userId, file.buffer.length, now);

  let uploaded: Awaited<ReturnType<typeof uploadImageBuffer>>;
  try {
    uploaded = await uploadImageBuffer(
      file.buffer,
      reservation.publicId,
      metadata.format === 'jpeg' ? 'jpg' : metadata.format,
    );
  } catch (error) {
    await releaseUploadReservation(userId, reservation);
    throw error;
  }

  if (uploaded.public_id !== reservation.publicId) {
    try {
      const result = await deleteImage(uploaded.public_id);
      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new ExternalServiceError(
          'Cloudinary could not remove the unexpected image',
        );
      }
      await releaseUploadReservation(userId, reservation);
    } catch (cleanupError) {
      console.error(
        '[ERROR] Failed to clean up image with unexpected Cloudinary identifier',
        cleanupError,
      );
    }
    throw new ExternalServiceError(
      'Cloudinary returned an unexpected image identifier',
    );
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      await transaction.imageAsset.create({
        data: {
          id: reservation.id,
          userId,
          type: AssetType.SOURCE,
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          fileSizeBytes: file.buffer.length,
          createdAt: now,
        },
      });
      await transaction.imageUploadReservation.delete({
        where: { id: reservation.id },
      });

      return transaction.imageAsset.findUniqueOrThrow({
        where: { id: reservation.id },
        select: {
          id: true,
          type: true,
          url: true,
          format: true,
          width: true,
          height: true,
          fileSizeBytes: true,
          createdAt: true,
        },
      });
    });
  } catch (databaseError) {
    try {
      const result = await deleteImage(uploaded.public_id);
      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new ExternalServiceError(
          'Cloudinary could not remove the unrecorded image',
        );
      }
      await releaseUploadReservation(userId, reservation);
    } catch (cleanupError) {
      console.error(
        '[ERROR] Failed to clean up image upload after database failure',
        cleanupError,
      );
      throw new ExternalServiceError(
        'Image metadata could not be saved and uploaded image cleanup failed',
      );
    }
    throw databaseError;
  }
}

export async function listUserImages(userId: string, page = 1, limit = 20) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    throw new ValidationError(
      `Page must be positive and limit must be between 1 and ${MAX_PAGE_SIZE}`,
    );
  }

  const now = new Date();
  const periodStart = monthlyPeriodStart(now);
  const [images, total, plan, usage, assets, reservations] = await Promise.all([
    prisma.imageAsset.findMany({
      where: { userId, deletionPending: false },
      select: {
        id: true,
        generationId: true,
        type: true,
        url: true,
        format: true,
        width: true,
        height: true,
        fileSizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.imageAsset.count({ where: { userId, deletionPending: false } }),
    findImageQuotaPlan(prisma, userId, now),
    prisma.imageUploadUsage.findUnique({
      where: { userId_periodStart: { userId, periodStart } },
      select: { uploads: true },
    }),
    prisma.imageAsset.aggregate({
      where: { userId },
      _sum: { fileSizeBytes: true },
    }),
    prisma.imageUploadReservation.aggregate({
      where: { userId },
      _sum: { fileSizeBytes: true },
    }),
  ]);

  return {
    images,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    uploadUsage: {
      periodStart,
      monthlyUploads: {
        used: usage?.uploads ?? 0,
        limit: plan.monthlyImageUploads,
        remaining: Math.max(
          0,
          plan.monthlyImageUploads - (usage?.uploads ?? 0),
        ),
      },
      storage: {
        usedBytes:
          (assets._sum.fileSizeBytes ?? 0) +
          (reservations._sum.fileSizeBytes ?? 0),
        limitBytes: plan.imageStorageLimitBytes,
        remainingBytes: Math.max(
          0,
          plan.imageStorageLimitBytes -
            (assets._sum.fileSizeBytes ?? 0) -
            (reservations._sum.fileSizeBytes ?? 0),
        ),
      },
    },
  };
}

export async function getUserImage(userId: string, imageId: string) {
  const image = await prisma.imageAsset.findFirst({
    where: { id: imageId, userId, deletionPending: false },
    select: {
      id: true,
      generationId: true,
      type: true,
      url: true,
      format: true,
      width: true,
      height: true,
      fileSizeBytes: true,
      createdAt: true,
    },
  });

  if (!image) throw new NotFoundError('Image not found');
  return image;
}

export async function deleteUserImage(userId: string, imageId: string) {
  const image = await prisma.imageAsset.findFirst({
    where: { id: imageId, userId },
    select: { id: true, publicId: true },
  });
  if (!image) throw new NotFoundError('Image not found');

  await prisma.imageAsset.update({
    where: { id: image.id },
    data: { deletionPending: true },
  });

  const cloudinaryResult = await deleteImage(image.publicId);
  if (
    cloudinaryResult.result !== 'ok' &&
    cloudinaryResult.result !== 'not found'
  ) {
    throw new ExternalServiceError('Cloudinary could not delete the image');
  }

  await prisma.imageAsset.deleteMany({
    where: { id: image.id, userId },
  });
}
