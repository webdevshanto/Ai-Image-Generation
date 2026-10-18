import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth.schema.js';

describe('registerSchema', () => {
  it('normalizes email and accepts a valid registration', () => {
    const result = registerSchema.safeParse({
      email: '  USER@example.com ',
      password: 'a-long-enough-password',
      name: 'User',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('rejects passwords shorter than 12 characters', () => {
    expect(
      registerSchema.safeParse({ email: 'user@example.com', password: 'short' })
        .success,
    ).toBe(false);
  });

  it("rejects passwords exceeding bcrypt's UTF-8 byte limit", () => {
    expect(
      registerSchema.safeParse({
        email: 'user@example.com',
        password: '😀'.repeat(19),
      }).success,
    ).toBe(false);
  });
});

describe('loginSchema', () => {
  it('rejects malformed email addresses', () => {
    expect(
      loginSchema.safeParse({ email: 'not-an-email', password: 'password' })
        .success,
    ).toBe(false);
  });
});
