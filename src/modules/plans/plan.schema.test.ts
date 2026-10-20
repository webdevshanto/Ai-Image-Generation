import { describe, expect, it } from 'vitest';
import { changePlanSchema } from './plan.schema.js';

describe('changePlanSchema', () => {
  it('accepts Free, Pro, and Max plan selections', () => {
    for (const planSlug of ['free', 'pro', 'max']) {
      expect(changePlanSchema.safeParse({ planSlug }).success).toBe(true);
    }
  });

  it('rejects arbitrary or missing plan slugs', () => {
    expect(changePlanSchema.safeParse({ planSlug: 'enterprise' }).success).toBe(
      false,
    );
    expect(changePlanSchema.safeParse({}).success).toBe(false);
  });
});
