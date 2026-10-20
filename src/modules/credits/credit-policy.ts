import type { GenerationMode, Plan } from '../../generated/prisma/client.js';

export function monthlyPeriodStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function quotaForMode(plan: Plan, mode: GenerationMode): number {
  switch (mode) {
    case 'TEXT_TO_IMAGE':
      return plan.textToImageCredits;
    case 'IMAGE_TO_IMAGE':
      return plan.imageToImageCredits;
    case 'ENHANCE_IMAGE':
      return plan.enhanceImageCredits;
  }
}

export function remainingQuota(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

export function quotaByMode(plan: Plan) {
  return {
    TEXT_TO_IMAGE: plan.textToImageCredits,
    IMAGE_TO_IMAGE: plan.imageToImageCredits,
    ENHANCE_IMAGE: plan.enhanceImageCredits,
  };
}
