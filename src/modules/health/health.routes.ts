import { Router } from 'express';
import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';

export const healthRoutes = Router();

// Liveness reports process status without depending on external services.
healthRoutes.get('/live', (req, res) => {
  res.json({
    success: true,
    message: 'Service is live',
    data: { status: 'live' },
    error: null,
    requestId: req.requestId,
  });
});

// Readiness checks dependencies so deployment systems can gate incoming traffic.
healthRoutes.get('/ready', async (req, res) => {
  const [database, cache] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);
  const checks = {
    database: database.status === 'fulfilled',
    redis: cache.status === 'fulfilled' && cache.value === 'PONG',
  };
  const ready = checks.database && checks.redis;

  return res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready
      ? 'Service is ready'
      : 'Service dependencies are unavailable',
    data: { status: ready ? 'ready' : 'not_ready', checks },
    error: ready ? null : { code: 'DEPENDENCY_UNAVAILABLE', details: null },
    requestId: req.requestId,
  });
});
