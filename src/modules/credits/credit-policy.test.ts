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
  textToVideoCredits: 2,
  imageToVideoCredits: 2,
  videoToVideoCredits: 2,
} as Plan;

const proPlan = {
  textToImageCredits: 20,
  imageToImageCredits: 20,
  textToVideoCredits: 6,
  imageToVideoCredits: 6,
  videoToVideoCredits: 6,
} as Plan;

describe('monthly credit policy', () => {
  it('uses separate monthly quotas for each generation mode', () => {
    expect(quotaForMode(freePlan, 'TEXT_TO_IMAGE')).toBe(5);
    expect(quotaForMode(freePlan, 'IMAGE_TO_IMAGE')).toBe(5);
    expect(quotaForMode(freePlan, 'TEXT_TO_VIDEO')).toBe(2);
    expect(quotaForMode(freePlan, 'IMAGE_TO_VIDEO')).toBe(2);
    expect(quotaForMode(freePlan, 'VIDEO_TO_VIDEO')).toBe(2);
    expect(quotaByMode(proPlan)).toEqual({
      TEXT_TO_IMAGE: 20,
      IMAGE_TO_IMAGE: 20,
      TEXT_TO_VIDEO: 6,
      IMAGE_TO_VIDEO: 6,
      VIDEO_TO_VIDEO: 6,
    });
    expect(
      Object.values(quotaByMode(freePlan)).reduce(
        (sum, quota) => sum + quota,
        0,
      ),
    ).toBe(16);
    expect(
      Object.values(quotaByMode(proPlan)).reduce(
        (sum, quota) => sum + quota,
        0,
      ),
    ).toBe(58);
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
