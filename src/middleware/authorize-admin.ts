import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { ForbiddenError, UnauthorizedError } from '../utils/api-error.js';

export async function authorizeAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) return next(new UnauthorizedError());

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return next(new UnauthorizedError('Account is not active'));
  }
  if (user.role !== UserRole.ADMIN) {
    return next(new ForbiddenError('Administrator access is required'));
  }

  return next();
}
