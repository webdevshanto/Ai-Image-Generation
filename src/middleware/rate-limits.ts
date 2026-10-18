import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

// Share one response shape while allowing stricter limits for costly operations.
function createRateLimit(max: number, windowMs: number, message: string) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message,
        data: null,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          details: null,
        },
        requestId: (req as Request).requestId,
      });
    },
  });
}

export const apiRateLimit = createRateLimit(
  120,
  60 * 1000,
  'Too many requests',
);
export const authRateLimit = createRateLimit(
  10,
  15 * 60 * 1000,
  'Too many authentication attempts',
);
export const generationRateLimit = createRateLimit(
  10,
  60 * 1000,
  'Too many generation requests',
);
export const uploadRateLimit = createRateLimit(
  20,
  60 * 1000,
  'Too many upload requests',
);
