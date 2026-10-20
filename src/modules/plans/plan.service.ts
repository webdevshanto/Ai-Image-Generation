import { SubscriptionStatus } from '../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';
import {
  ConflictError,
  NotFoundError,
  PaymentRequiredError,
} from '../../utils/api-error.js';
import type { ChangePlanInput } from './plan.schema.js';

const planOrder = ['free', 'pro', 'max'];

function planView(plan: {
  slug: string;
  name: string;
  priceCents: number | null;
  currency: string;
  monthlyCredits: number;
  textToImageCredits: number;
  imageToImageCredits: number;
  textToVideoCredits: number;
  imageToVideoCredits: number;
  videoToVideoCredits: number;
  monthlyImageUploads: number;
  libraryImageLimit: number;
  libraryVideoLimit: number;
  imageStorageLimitBytes: number;
  isActive: boolean;
  isComingSoon: boolean;
}) {
  return {
    slug: plan.slug,
    name: plan.name,
    priceCents: plan.priceCents,
    currency: plan.currency,
    monthlyCredits: plan.monthlyCredits,
    creditsPerMode: {
      textToImage: plan.textToImageCredits,
      imageToImage: plan.imageToImageCredits,
      textToVideo: plan.textToVideoCredits,
      imageToVideo: plan.imageToVideoCredits,
      videoToVideo: plan.videoToVideoCredits,
    },
    imageUploads: {
      monthlyLimit: plan.monthlyImageUploads,
      libraryImageLimit: plan.libraryImageLimit,
      storageLimitBytes: plan.imageStorageLimitBytes,
      storageLimitMegabytes: Math.floor(
        plan.imageStorageLimitBytes / (1024 * 1024),
      ),
    },
    videoLibrary: {
      limit: plan.libraryVideoLimit,
      maxFileSizeBytes: 25 * 1024 * 1024,
    },
    available: plan.isActive && !plan.isComingSoon,
    purchasable:
      plan.isActive && !plan.isComingSoon && plan.priceCents !== null,
    comingSoon: plan.isComingSoon,
  };
}

export async function listPlans() {
  const plans = await prisma.plan.findMany({
    orderBy: [{ priceCents: 'asc' }, { name: 'asc' }],
  });

  plans.sort((first, second) => {
    const firstRank = planOrder.indexOf(first.slug);
    const secondRank = planOrder.indexOf(second.slug);
    const normalizedFirstRank = firstRank === -1 ? planOrder.length : firstRank;
    const normalizedSecondRank =
      secondRank === -1 ? planOrder.length : secondRank;

    return (
      normalizedFirstRank - normalizedSecondRank ||
      first.name.localeCompare(second.name)
    );
  });

  return plans.map(planView);
}

export async function getCurrentUserPlan(userId: string, now = new Date()) {
  const subscription = await prisma.subscription.findFirst({
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

  const plan =
    subscription?.plan ??
    (await prisma.plan.findUnique({ where: { slug: 'free' } }));
  if (!plan || !plan.isActive) {
    throw new NotFoundError('The Free plan is not configured');
  }

  return {
    plan: planView(plan),
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          provider: subscription.provider,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
  };
}

export async function changeUserPlan(
  userId: string,
  input: ChangePlanInput,
  now = new Date(),
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;

      const targetPlan = await transaction.plan.findUnique({
        where: { slug: input.planSlug },
      });
      if (!targetPlan || !targetPlan.isActive || targetPlan.isComingSoon) {
        throw new ConflictError(
          `${input.planSlug} is not currently available`,
          {
            planSlug: input.planSlug,
            comingSoon: targetPlan?.isComingSoon ?? false,
          },
        );
      }

      const subscription = await transaction.subscription.findFirst({
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

      if (input.planSlug === 'pro') {
        if (subscription?.plan.slug === 'pro') {
          if (subscription.cancelAtPeriodEnd) {
            if (subscription.provider !== 'manual-admin') {
              throw new ConflictError(
                'This subscription cancellation must be reversed with its payment provider',
              );
            }

            const updated = await transaction.subscription.update({
              where: { id: subscription.id },
              data: { cancelAtPeriodEnd: false },
              include: { plan: true },
            });
            return {
              status: 'cancellation_reversed' as const,
              currentPlan: planView(updated.plan),
              subscription: {
                id: updated.id,
                cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
              },
            };
          }

          return {
            status: 'already_active' as const,
            currentPlan: planView(subscription.plan),
          };
        }
        throw new PaymentRequiredError(
          'Pro upgrade is not available yet because payment checkout has not been configured. An administrator can grant complimentary Pro access.',
        );
      }

      if (input.planSlug === 'free') {
        if (!subscription) {
          const freePlan = await transaction.plan.findUnique({
            where: { slug: 'free' },
          });
          if (!freePlan || !freePlan.isActive) {
            throw new NotFoundError('The Free plan is not configured');
          }
          return {
            status: 'already_active' as const,
            currentPlan: planView(freePlan),
          };
        }

        if (subscription.plan.slug === 'free') {
          return {
            status: 'already_active' as const,
            currentPlan: planView(subscription.plan),
          };
        }
        if (!subscription.currentPeriodEnd) {
          throw new ConflictError(
            'This subscription has no period end; contact support to change plans',
          );
        }

        const updated = await transaction.subscription.update({
          where: { id: subscription.id },
          data: { cancelAtPeriodEnd: true },
          include: { plan: true },
        });
        return {
          status: 'downgrade_scheduled' as const,
          currentPlan: planView(updated.plan),
          effectiveAt: updated.currentPeriodEnd,
          subscription: {
            id: updated.id,
            cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
          },
        };
      }

      throw new ConflictError('This plan is coming soon', {
        planSlug: input.planSlug,
      });
    },
    { maxWait: 30_000, timeout: 30_000 },
  );
}
