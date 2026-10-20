import { z } from 'zod';

// bcrypt only uses the first 72 UTF-8 bytes, so reject longer values explicitly.
export const passwordSchema = z
  .string()
  .refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password must be at most 72 bytes',
  );

export const strongPasswordSchema = passwordSchema
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol');

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z
      .string()
      .trim()
      .email()
      .transform((email) => email.toLowerCase()),
    password: strongPasswordSchema,
    confirmPassword: passwordSchema.min(1),
  })
  .superRefine(({ password, confirmPassword }, context) => {
    if (password !== confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
  })
  .transform(({ firstName, lastName, email, password }) => ({
    firstName,
    lastName,
    email,
    password,
  }));

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
