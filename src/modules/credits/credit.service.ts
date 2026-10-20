import {
  CreditTransactionType,
  GenerationMode,
  GenerationStatus,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';
import type { Plan, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/api-error.js';
import {
  monthlyPeriodStart,
  quotaByMode,
  quotaForMode,
  remainingQuota,
} from './credit-policy.js';

async function findEntitledPlan(
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

export async function getCreditSummary(userId: string, now = new Date()) {
  const periodStart = monthlyPeriodStart(now);
  const plan = await findEntitledPlan(prisma, userId, now);
  const usage = await prisma.creditUsage.findMany({
    where: { userId, periodStart },
  });
  const usedByMode = new Map(usage.map((entry) => [entry.mode, entry.used]));
  const limits = quotaByMode(plan);
  const modes = Object.values(GenerationMode);

  return {
    plan: { slug: plan.slug, name: plan.name },
    periodStart,
    resetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ),
    totalLimit: plan.monthlyCredits,
    totalUsed: modes.reduce(
      (total, mode) => total + (usedByMode.get(mode) ?? 0),
      0,
    ),
    modes: {
      textToImage: {
        limit: limits.TEXT_TO_IMAGE,
        used: usedByMode.get(GenerationMode.TEXT_TO_IMAGE) ?? 0,
        remaining: remainingQuota(
          limits.TEXT_TO_IMAGE,
          usedByMode.get(GenerationMode.TEXT_TO_IMAGE) ?? 0,
        ),
      },
      imageToImage: {
        limit: limits.IMAGE_TO_IMAGE,
        used: usedByMode.get(GenerationMode.IMAGE_TO_IMAGE) ?? 0,
        remaining: remainingQuota(
          limits.IMAGE_TO_IMAGE,
          usedByMode.get(GenerationMode.IMAGE_TO_IMAGE) ?? 0,
        ),
      },
      textToVideo: {
        limit: limits.TEXT_TO_VIDEO,
        used: usedByMode.get(GenerationMode.TEXT_TO_VIDEO) ?? 0,
        remaining: remainingQuota(
          limits.TEXT_TO_VIDEO,
          usedByMode.get(GenerationMode.TEXT_TO_VIDEO) ?? 0,
        ),
      },
      imageToVideo: {
        limit: limits.IMAGE_TO_VIDEO,
        used: usedByMode.get(GenerationMode.IMAGE_TO_VIDEO) ?? 0,
        remaining: remainingQuota(
          limits.IMAGE_TO_VIDEO,
          usedByMode.get(GenerationMode.IMAGE_TO_VIDEO) ?? 0,
        ),
      },
      videoToVideo: {
        limit: limits.VIDEO_TO_VIDEO,
        used: usedByMode.get(GenerationMode.VIDEO_TO_VIDEO) ?? 0,
        remaining: remainingQuota(
          limits.VIDEO_TO_VIDEO,
          usedByMode.get(GenerationMode.VIDEO_TO_VIDEO) ?? 0,
        ),
      },
    },
  };
}

export async function getCreditHistory(userId: string) {
  return prisma.creditTransaction.findMany({
    where: { userId },
    select: {
      id: true,
      generationId: true,
      type: true,
      amount: true,
      mode: true,
      periodStart: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function reserveGenerationCredit(
  userId: string,
  generationId: string,
  mode: GenerationMode,
  now = new Date(),
) {
  const periodStart = monthlyPeriodStart(now);

  return prisma.$transaction(async (transaction) => {
    const generation = await transaction.generationJob.findUnique({
      where: { id: generationId },
      select: { id: true, userId: true, mode: true, status: true },
    });
    if (!generation || generation.userId !== userId) {
      throw new NotFoundError('Generation job not found');
    }
    if (
      generation.mode !== mode ||
      generation.status !== GenerationStatus.QUEUED
    ) {
      throw new ConflictError('Credit can only be reserved for a queued job');
    }

    const plan = await findEntitledPlan(transaction, userId, now);
    const quota = quotaForMode(plan, mode);
    if (quota <= 0) {
      throw new ConflictError(
        'This plan does not include this generation mode',
      );
    }

    const chargeCreated = await transaction.creditTransaction.createMany({
      data: [
        {
          userId,
          generationId,
          type: CreditTransactionType.GENERATION,
          amount: -1,
          periodStart,
          mode,
          description: `${mode} generation credit reserved`,
        },
      ],
      skipDuplicates: true,
    });
    if (chargeCreated.count !== 1) return { alreadyReserved: true };

    await transaction.creditUsage.createMany({
      data: [{ userId, mode, periodStart, used: 0 }],
      skipDuplicates: true,
    });

    const incremented = await transaction.creditUsage.updateMany({
      where: { userId, mode, periodStart, used: { lt: quota } },
      data: { used: { increment: 1 } },
    });
    if (incremented.count !== 1) {
      throw new ConflictError('Monthly credits for this mode are exhausted', {
        mode,
        limit: quota,
        resetsAt: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        ),
      });
    }

    await transaction.generationJob.update({
      where: { id: generationId },
      data: { creditsUsed: 1 },
    });

    return {
      alreadyReserved: false,
      limit: quota,
      remaining: quota - 1,
      periodStart,
    };
  });
}

export async function refundFailedGeneration(
  userId: string,
  generationId: string,
  now = new Date(),
) {
  return prisma.$transaction(async (transaction) => {
    const generation = await transaction.generationJob.findUnique({
      where: { id: generationId },
      select: { id: true, userId: true, status: true },
    });
    if (!generation || generation.userId !== userId) {
      throw new NotFoundError('Generation job not found');
    }
    if (
      generation.status !== GenerationStatus.FAILED &&
      generation.status !== GenerationStatus.CANCELLED
    ) {
      throw new ConflictError('Credits can only be refunded for failed jobs');
    }

    const charge = await transaction.creditTransaction.findFirst({
      where: {
        generationId,
        userId,
        type: CreditTransactionType.GENERATION,
      },
      select: { periodStart: true, mode: true },
    });
    if (!charge?.periodStart || !charge.mode) {
      return { refunded: false, reason: 'no-credit-reservation' };
    }

    const refundCreated = await transaction.creditTransaction.createMany({
      data: [
        {
          userId,
          generationId,
          type: CreditTransactionType.REFUND,
          amount: 1,
          periodStart: charge.periodStart,
          mode: charge.mode,
          description: `Refund for failed ${charge.mode} generation`,
        },
      ],
      skipDuplicates: true,
    });
    if (refundCreated.count !== 1) {
      return { refunded: false, reason: 'already-refunded' };
    }

    const decremented = await transaction.creditUsage.updateMany({
      where: {
        userId,
        mode: charge.mode,
        periodStart: charge.periodStart,
        used: { gt: 0 },
      },
      data: { used: { decrement: 1 } },
    });
    if (decremented.count !== 1) {
      throw new ConflictError('Reserved credit usage could not be refunded');
    }

    await transaction.generationJob.update({
      where: { id: generationId },
      data: { creditsUsed: 0 },
    });

    return { refunded: true, refundedAt: now };
  });
}
