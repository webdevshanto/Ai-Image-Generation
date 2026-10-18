import { compare, hash } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { ConflictError, UnauthorizedError } from '../../utils/api-error.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

function isUniqueConstraintError(error: unknown): boolean {
  // Convert Prisma's unique-email violation into a stable client-facing error.
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function issueAccessToken(user: { id: string; email: string }) {
  // Keep access tokens short-lived; refresh-token support can be added later.
  return jwt.sign({ email: user.email }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: '1h',
  });
}

export async function registerUser(input: RegisterInput) {
  const passwordHash = await hash(input.password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
      },
      select: {
        // Never return the password hash from account creation.
        id: true,
        email: true,
        name: true,
        role: true,
        credits: true,
        createdAt: true,
      },
    });

    return { user, token: issueAccessToken(user) };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError('An account with this email already exists');
    }
    throw error;
  }
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (
    !user ||
    !user.isActive ||
    !(await compare(input.password, user.passwordHash))
  ) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const publicUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    credits: user.credits,
    createdAt: user.createdAt,
  };

  return { user: publicUser, token: issueAccessToken(user) };
}

export async function findCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      credits: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError('Account is no longer available');
  }

  return user;
}
