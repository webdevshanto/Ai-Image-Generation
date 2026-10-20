import { describe, expect, it } from 'vitest';
import type { Plan } from '../../generated/prisma/client.js';
import {
  monthlyPeriodStart,
  quotaByMode,
  quotaForMode,
  remainingQuota,
} from './credit-policy.js';

const freePlan = {
  textToImageCredits: 5,
  imageToImageCredits: 5,
  enhanceImageCredits: 5,
} as Plan;

const proPlan = {
  textToImageCredits: 20,
  imageToImageCredits: 20,
  enhanceImageCredits: 20,
} as Plan;

describe('monthly credit policy', () => {
  it('uses separate monthly quotas for each generation mode', () => {
    expect(quotaForMode(freePlan, 'TEXT_TO_IMAGE')).toBe(5);
    expect(quotaForMode(freePlan, 'IMAGE_TO_IMAGE')).toBe(5);
    expect(quotaForMode(freePlan, 'ENHANCE_IMAGE')).toBe(5);
    expect(quotaByMode(proPlan)).toEqual({
      TEXT_TO_IMAGE: 20,
      IMAGE_TO_IMAGE: 20,
      ENHANCE_IMAGE: 20,
    });
  });

  it('starts the usage period at midnight UTC on the first calendar day', () => {
    expect(monthlyPeriodStart(new Date('2026-10-19T22:53:06.562Z'))).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(monthlyPeriodStart(new Date('2027-01-02T12:00:00.000Z'))).toEqual(
      new Date('2027-01-01T00:00:00.000Z'),
    );
  });

  it('never reports negative remaining credits after a plan downgrade', () => {
    expect(remainingQuota(5, 8)).toBe(0);
    expect(remainingQuota(5, 3)).toBe(2);
  });
});
