import { describe, expect, it } from 'vitest';
import { createPlanGrantSchema } from './plan-grant.schema.js';

describe('createPlanGrantSchema', () => {
  it('normalizes the target email and accepts a bounded grant duration', () => {
    expect(
      createPlanGrantSchema.parse({
        email: ' USER@gmail.com ',
        durationDays: 30,
        note: 'Complimentary access',
      }),
    ).toEqual({
      email: 'user@gmail.com',
      durationDays: 30,
      note: 'Complimentary access',
    });
  });

  it('rejects missing, fractional, or overlong durations', () => {
    for (const durationDays of [undefined, 0, 1.5, 366]) {
      expect(
        createPlanGrantSchema.safeParse({
          email: 'user@gmail.com',
          durationDays,
        }).success,
      ).toBe(false);
    }
  });
});
