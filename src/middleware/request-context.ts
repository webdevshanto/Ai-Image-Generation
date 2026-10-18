import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestContext: RequestHandler = (req, res, next) => {
  // Generate a server-controlled ID so clients cannot inject log identifiers.
  const requestId = randomUUID();
  const startedAt = performance.now();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Log after the response finishes so the final status and duration are known.
  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    console.info(
      `[INFO] ${req.method} ${req.path} ${res.statusCode} ${durationMs}ms request=${requestId}`,
    );
  });

  next();
};
