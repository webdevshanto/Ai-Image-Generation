import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { AuthTokenType } from '../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashAuthToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateVerificationCode() {
  return randomInt(100000, 1000000).toString();
}

export async function issueAuthToken(
  userId: string,
  type: AuthTokenType,
  expiresInMs: number,
  tokenValue?: string,
) {
  const token = tokenValue ?? randomBytes(32).toString('base64url');
  const tokenHash = hashAuthToken(token);
  const expiresAt = new Date(Date.now() + expiresInMs);

  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type } }),
    prisma.authToken.create({ data: { userId, type, tokenHash, expiresAt } }),
  ]);

  return token;
}

export async function issueVerificationCode(
  userId: string,
  expiresInMs: number,
) {
  const code = generateVerificationCode();
  await issueAuthToken(
    userId,
    'EMAIL_VERIFICATION' as AuthTokenType,
    expiresInMs,
    code,
  );
  return code;
}
