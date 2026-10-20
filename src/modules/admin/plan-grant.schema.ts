import { z } from 'zod';
import { loginSchema } from '../auth/auth.schema.js';

export const createPlanGrantSchema = z.object({
  email: loginSchema.shape.email,
  durationDays: z.coerce.number().int().min(1).max(365),
  note: z.string().trim().max(500).optional(),
});

export type CreatePlanGrantInput = z.infer<typeof createPlanGrantSchema>;
