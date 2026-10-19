import { describe, expect, it } from 'vitest';
import { generateVerificationCode, hashAuthToken } from './auth-token.js';
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
      password: 'Strong-Password-123!',
      confirmPassword: 'Strong-Password-123!',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
      expect(result.data).not.toHaveProperty('confirmPassword');
    }
  });

  it('rejects passwords shorter than 8 characters', () => {
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

  it('requires uppercase, lowercase, number, and symbol characters', () => {
    for (const password of [
      'lowercase123!',
      'UPPERCASE123!',
      'NoNumbers!!',
      'NoSymbols123',
    ]) {
      expect(
        registerSchema.safeParse({
          firstName: 'User',
          lastName: 'Example',
          email: 'user@example.com',
          password,
          confirmPassword: password,
        }).success,
      ).toBe(false);
    }
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
        password: 'Strong-Password-123!',
        confirmPassword: 'Different-Password-456!',
      }).success,
    ).toBe(false);
  });

  it('keeps the account creation payload separate from the verification OTP', () => {
    const registration = {
      firstName: 'User',
      lastName: 'Example',
      email: 'user@example.com',
      password: 'Strong-Password-123!',
      confirmPassword: 'Strong-Password-123!',
    };

    const result = registerSchema.safeParse(registration);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('otp');
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

describe('verification code validation', () => {
  it('accepts a 6-digit numeric verification code and rejects invalid input', () => {
    expect(
      verifyEmailSchema.safeParse({
        email: 'user@example.com',
        otp: '123456',
      }).success,
    ).toBe(true);
    expect(
      verifyEmailSchema.safeParse({
        email: 'user@example.com',
        otp: 'ABC123',
      }).success,
    ).toBe(false);
    expect(
      verifyEmailSchema.safeParse({
        email: 'user@example.com',
        otp: '12345',
      }).success,
    ).toBe(false);
  });

  it('creates a 6-digit verification code', () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe('account management schemas', () => {
  it('accepts a verification code and normalizes forgot-password email', () => {
    expect(
      verifyEmailSchema.safeParse({
        email: ' USER@example.com ',
        otp: '123456',
      }).success,
    ).toBe(true);
    const result = forgotPasswordSchema.safeParse({
      email: ' USER@example.com ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('requires a strong replacement password', () => {
    expect(
      resetPasswordSchema.safeParse({
        otp: '123456',
        password: 'New-Strong-Password-123!',
      }).success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({
        otp: 'not-an-otp',
        password: 'New-Strong-Password-123!',
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        otp: '123456',
        password: 'short',
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        otp: '123456',
        password: 'weakpassword',
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'current-password',
        newPassword: 'New-Strong-Password-123!',
        confirmPassword: 'New-Strong-Password-123!',
      }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'current-password',
        newPassword: 'weakpassword',
        confirmPassword: 'weakpassword',
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'current-password',
        newPassword: 'New-Strong-Password-123!',
        confirmPassword: 'Different-Password-456!',
      }).success,
    ).toBe(false);
  });

  it('validates profile and account-deletion inputs', () => {
    expect(
      updateProfileSchema.safeParse({
        firstName: 'Updated',
        lastName: 'Name',
        email: ' NEW@example.com ',
      }).success,
    ).toBe(true);
    const profile = updateProfileSchema.parse({
      firstName: 'Updated',
      lastName: 'Name',
      email: ' NEW@example.com ',
    });
    expect(profile.email).toBe('new@example.com');
    expect(
      deleteAccountSchema.safeParse({ password: 'current-password' }).success,
    ).toBe(true);
  });
});
