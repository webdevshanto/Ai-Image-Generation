import type { Request, Response } from 'express';

// Return a consistent API error when no registered route matches the request.
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    data: null,
    error: {
      code: 'ROUTE_NOT_FOUND',
      details: null,
    },
    requestId: req.requestId,
  });
}
