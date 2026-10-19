import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../../db/redis.js';
import { prisma } from '../../db/prisma.js';

type RedisScalar = string | number | boolean;
type RedisReply = RedisScalar | RedisScalar[];

function isRedisScalar(value: unknown): value is RedisScalar {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isRedisReply(value: unknown): value is RedisReply {
  return (
    isRedisScalar(value) || (Array.isArray(value) && value.every(isRedisScalar))
  );
}

function createRedisStore(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: async (...args: string[]) => {
      const [command, ...commandArgs] = args;
      const result: unknown = await redis.call(command, commandArgs);
      if (!isRedisReply(result)) {
        throw new Error('Redis rate-limit command returned an invalid reply');
      }
      return result;
    },
  });
}

function layeredLimiter(
  options: Parameters<typeof rateLimit>[0],
  prefix: string,
) {
  return [
    rateLimit(options),
    rateLimit({
      ...options,
      store: createRedisStore(prefix),
      passOnStoreError: true,
    }),
  ] as const;
}

function limiter(
  limit: number,
  windowMs: number,
  message: string,
  prefix: string,
) {
  const options: Parameters<typeof rateLimit>[0] = {
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        message,
        data: null,
        error: { code: 'TOO_MANY_REQUESTS' },
      });
    },
  };

  return layeredLimiter(options, prefix);
}

export const registrationOtpLimiter = limiter(
  3,
  15 * 60 * 1000,
  'Too many signup verification requests. Try again in 15 minutes.',
  'auth:signup-otp:',
);

export const verificationOtpLimiter = limiter(
  5,
  15 * 60 * 1000,
  'Too many verification attempts. Try again in 15 minutes.',
  'auth:verify-otp:',
);

export const refreshTokenLimiter = limiter(
  20,
  15 * 60 * 1000,
  'Too many refresh attempts. Try again in 15 minutes.',
  'auth:refresh:',
);

export const emailChangeLimiter = layeredLimiter(
  {
    windowMs: 60 * 60 * 1000,
    limit: 3,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (request) => request.user!.id,
    skip: async (request) => {
      const email = request.body?.email;
      if (typeof email !== 'string' || !request.user) return true;

      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { email: true },
      });

      return !user || email.trim().toLowerCase() === user.email.toLowerCase();
    },
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        message: 'Too many email changes. Try again in one hour.',
        data: null,
        error: { code: 'TOO_MANY_REQUESTS' },
      });
    },
  },
  'auth:email-change:',
);
