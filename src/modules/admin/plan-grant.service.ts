import { randomUUID } from 'node:crypto';
import { SubscriptionStatus, UserRole } from '../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/api-error.js';
import type { CreatePlanGrantInput } from './plan-grant.schema.js';

export async function grantProPlan(
  adminUserId: string,
  input: CreatePlanGrantInput,
  now = new Date(),
) {
  return prisma.$transaction(
    async (transaction) => {
      const admin = await transaction.user.findUnique({
        where: { id: adminUserId },
        select: { role: true, isActive: true },
      });
      if (!admin?.isActive || admin.role !== UserRole.ADMIN) {
        throw new ConflictError('Administrator account is not active');
      }

      const recipient = await transaction.user.findUnique({
        where: { email: input.email },
        select: {
          id: true,
          email: true,
          isActive: true,
          emailVerifiedAt: true,
        },
      });
      if (!recipient || !recipient.isActive || !recipient.emailVerifiedAt) {
        throw new NotFoundError(
          'No active verified account exists for this email',
        );
      }

      // Serialize grants for a recipient so concurrent requests cannot overwrite extensions.
      await transaction.$queryRaw`
      SELECT "id" FROM "User" WHERE "id" = ${recipient.id} FOR UPDATE
    `;

      const proPlan = await transaction.plan.findUnique({
        where: { slug: 'pro' },
      });
      if (!proPlan?.isActive || proPlan.isComingSoon) {
        throw new NotFoundError('The Pro plan is not available');
      }

      const currentGrant = await transaction.subscription.findFirst({
        where: {
          userId: recipient.id,
          provider: 'manual-admin',
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: { gt: now },
        },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      const currentPaidPlan = await transaction.subscription.findFirst({
        where: {
          userId: recipient.id,
          provider: { not: 'manual-admin' },
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: { lte: now },
          OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
        },
        include: { plan: { select: { slug: true } } },
      });
      if (currentPaidPlan) {
        throw new ConflictError(
          'The user already has an active paid subscription',
        );
      }

      const currentEnd = currentGrant?.currentPeriodEnd;
      const startsAt = currentEnd && currentEnd > now ? currentEnd : now;
      const endsAt = new Date(
        startsAt.getTime() + input.durationDays * 24 * 60 * 60 * 1000,
      );

      const subscription = currentGrant
        ? await transaction.subscription.update({
            where: { id: currentGrant.id },
            data: {
              planId: proPlan.id,
              currentPeriodEnd: endsAt,
              cancelAtPeriodEnd: false,
            },
          })
        : await transaction.subscription.create({
            data: {
              userId: recipient.id,
              planId: proPlan.id,
              status: SubscriptionStatus.ACTIVE,
              provider: 'manual-admin',
              providerReference: `manual-grant:${randomUUID()}`,
              currentPeriodStart: now,
              currentPeriodEnd: endsAt,
            },
          });

      const grant = await transaction.planGrant.create({
        data: {
          recipientUserId: recipient.id,
          grantedByUserId: adminUserId,
          planId: proPlan.id,
          subscriptionId: subscription.id,
          durationDays: input.durationDays,
          note: input.note,
        },
        select: {
          id: true,
          durationDays: true,
          note: true,
          createdAt: true,
        },
      });

      return {
        grant,
        user: { id: recipient.id, email: recipient.email },
        plan: { slug: proPlan.slug, name: proPlan.name },
        startsAt,
        expiresAt: endsAt,
        subscriptionExtended: Boolean(currentGrant),
      };
    },
    { maxWait: 30_000, timeout: 30_000 },
  );
}

export async function listPlanGrants() {
  return prisma.planGrant.findMany({
    select: {
      id: true,
      durationDays: true,
      note: true,
      createdAt: true,
      recipient: { select: { id: true, email: true } },
      grantedBy: { select: { id: true, email: true } },
      plan: { select: { slug: true, name: true } },
      subscription: {
        select: {
          currentPeriodStart: true,
          currentPeriodEnd: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
