import { createHash, randomBytes } from 'node:crypto';
import type { AuthTokenType } from '../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';

export function hashAuthToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueAuthToken(
  userId: string,
  type: AuthTokenType,
  expiresInMs: number,
) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashAuthToken(token);
  const expiresAt = new Date(Date.now() + expiresInMs);

  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type } }),
    prisma.authToken.create({ data: { userId, type, tokenHash, expiresAt } }),
  ]);

  return token;
}
