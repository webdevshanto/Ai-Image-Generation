import { z } from 'zod';

// bcrypt only uses the first 72 UTF-8 bytes, so reject longer values explicitly.
const passwordSchema = z
  .string()
  .refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password must be at most 72 bytes',
  );

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  password: passwordSchema.min(12),
  name: z.string().trim().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  password: passwordSchema.min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
