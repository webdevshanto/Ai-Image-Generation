import type { Request, Response } from 'express';

// Keep successful responses consistent and include the request ID for support.
export function sendSuccess<T>(
  req: Request,
  res: Response,
  message: string,
  data: T,
  statusCode = 200,
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
    requestId: req.requestId,
  });
}
