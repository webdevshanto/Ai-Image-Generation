import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/api-error.js';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  // Accept bearer tokens first, with the configured cookie as a browser fallback.
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.cookies?.token ?? null);

  if (!token) {
    return next(new UnauthorizedError());
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      sub: string;
      email: string;
    };

    req.user = {
      id: payload.sub,
      email: payload.email,
    };

    return next();
  } catch {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}
