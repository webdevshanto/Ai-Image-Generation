import { describe, expect, it } from 'vitest';
import { hashAuthToken } from './auth-token.js';
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from './auth-input.schema.js';
import { loginSchema, registerSchema } from './auth.schema.js';

describe('registerSchema', () => {
  it('normalizes email and accepts a valid registration', () => {
    const result = registerSchema.safeParse({
      firstName: 'User',
      lastName: 'Example',
      email: '  USER@example.com ',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
      expect(result.data).not.toHaveProperty('confirmPassword');
    }
  });

  it('rejects passwords shorter than 12 characters', () => {
    expect(
      registerSchema.safeParse({
        firstName: 'User',
        lastName: 'Example',
        email: 'user@example.com',
        password: 'short',
        confirmPassword: 'short',
      }).success,
    ).toBe(false);
  });

  it("rejects passwords exceeding bcrypt's UTF-8 byte limit", () => {
    expect(
      registerSchema.safeParse({
        firstName: 'User',
        lastName: 'Example',
        email: 'user@example.com',
        password: '😀'.repeat(19),
        confirmPassword: '😀'.repeat(19),
      }).success,
    ).toBe(false);
  });

  it('rejects mismatched confirmation passwords', () => {
    expect(
      registerSchema.safeParse({
        firstName: 'User',
        lastName: 'Example',
        email: 'user@example.com',
        password: 'a-long-enough-password',
        confirmPassword: 'a-different-password',
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

describe('hashAuthToken', () => {
  it('stores a stable digest rather than the raw token', () => {
    const token = 'one-time-secret';
    const digest = hashAuthToken(token);

    expect(digest).toHaveLength(64);
    expect(digest).not.toBe(token);
    expect(hashAuthToken(token)).toBe(digest);
  });
});

describe('account management schemas', () => {
  it('accepts a verification token and normalizes forgot-password email', () => {
    expect(verifyEmailSchema.safeParse({ token: 'a'.repeat(43) }).success).toBe(
      true,
    );
    const result = forgotPasswordSchema.safeParse({
      email: ' USER@example.com ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('requires a strong replacement password', () => {
    expect(
      resetPasswordSchema.safeParse({
        token: 'a'.repeat(43),
        password: 'short',
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'current-password',
        newPassword: 'new-strong-password',
      }).success,
    ).toBe(true);
  });

  it('validates profile and account-deletion inputs', () => {
    expect(
        updateProfileSchema.safeParse({
          firstName: 'Updated',
          lastName: 'Name',
        }).success,
    ).toBe(true);
    expect(
      deleteAccountSchema.safeParse({ password: 'current-password' }).success,
    ).toBe(true);
  });
});
