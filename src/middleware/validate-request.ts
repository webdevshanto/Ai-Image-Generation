import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

// Replace the raw body with parsed data so controllers receive validated input.
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return next(result.error);
    }

    req.body = result.data;
    return next();
  };
}
