import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/api-error.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  // Express identifies error middleware by its four-argument signature.
  void next;

  // Keep validation failures in the same response envelope as other API errors.
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Request validation failed',
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        details: error.issues,
      },
      requestId: req.requestId,
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      data: null,
      error: {
        code: error.code,
        details: error.details ?? null,
      },
      requestId: res.getHeader('X-Request-Id') ?? null,
    });
  }

  // Hide internal exception details from clients while retaining a server log.
  const statusCode =
    'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;
  const message = statusCode < 500 ? error.message : 'Internal server error';

  const requestId = res.getHeader('X-Request-Id') ?? 'unknown';
  console.error(`[ERROR] request=${requestId} ${error.message}`);

  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error: {
      code: statusCode < 500 ? 'REQUEST_ERROR' : 'INTERNAL_SERVER_ERROR',
      details: null,
    },
    requestId: res.getHeader('X-Request-Id') ?? null,
  });
};
