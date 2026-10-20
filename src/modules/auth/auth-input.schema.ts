import { z } from 'zod';
import {
  loginSchema,
  passwordSchema,
  strongPasswordSchema,
} from './auth.schema.js';

export const verifyEmailSchema = z.object({
  email: loginSchema.shape.email,
  otp: z.string().regex(/^\d{6}$/),
});

export const forgotPasswordSchema = z.object({
  email: loginSchema.shape.email,
});

export const resetPasswordSchema = z.object({
  otp: z.string().regex(/^\d{6}$/),
  password: strongPasswordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: loginSchema.shape.password,
    newPassword: strongPasswordSchema,
    confirmPassword: passwordSchema.min(8),
  })
  .superRefine(({ newPassword, confirmPassword }, context) => {
    if (newPassword !== confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
  })
  .transform(({ currentPassword, newPassword }) => ({
    currentPassword,
    newPassword,
  }));

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: loginSchema.shape.email,
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
