import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// Lazy connection lets liveness checks and local startup work without Redis.
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 1500,
  retryStrategy: (attempt) => (attempt <= 2 ? attempt * 100 : null),
});

redis.on('error', (error) => {
  console.error(`[ERROR] Redis connection: ${error.message}`);
});
