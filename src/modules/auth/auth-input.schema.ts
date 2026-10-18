import { z } from 'zod';
import { loginSchema, passwordSchema } from './auth.schema.js';

export const verifyEmailSchema = z.object({
  token: z.string().min(32).max(200),
});

export const forgotPasswordSchema = z.object({
  email: loginSchema.shape.email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(200),
  password: passwordSchema.min(12),
});

export const changePasswordSchema = z.object({
  currentPassword: loginSchema.shape.password,
  newPassword: passwordSchema.min(12),
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

export const deleteAccountSchema = z.object({
  password: loginSchema.shape.password,
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
