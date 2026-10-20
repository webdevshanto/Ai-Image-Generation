import { z } from 'zod';

export const changePlanSchema = z.object({
  planSlug: z.enum(['free', 'pro', 'max']),
});

export type ChangePlanInput = z.infer<typeof changePlanSchema>;
