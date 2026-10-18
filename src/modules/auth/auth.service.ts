import { compare, hash } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { AuthTokenType } from '../../generated/prisma/client.js';
import { deleteImage } from '../../services/cloudinary.service.js';
import { sendAuthEmail } from '../../services/email.service.js';
import {
  ConflictError,
  ExternalServiceError,
  UnauthorizedError,
} from '../../utils/api-error.js';
import { hashAuthToken, issueAuthToken } from './auth-token.js';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  UpdateProfileInput,
  VerifyEmailInput,
} from './auth-input.schema.js';
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
  let user;

  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        name: `${input.firstName} ${input.lastName}`,
        passwordHash,
        emailVerifiedAt: null,
      },
      select: {
        // Never return the password hash from account creation.
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        role: true,
        credits: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError('An account with this email already exists');
    }
    throw error;
  }

  const token = await issueAuthToken(
    user.id,
    AuthTokenType.EMAIL_VERIFICATION,
    24 * 60 * 60 * 1000,
  );
  let emailSent = true;

  try {
    await sendVerificationMessage(user.email, token);
  } catch {
    emailSent = false;
    console.error('[ERROR] Could not deliver an email verification message');
  }

  return { user, emailSent };
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

  if (!user.emailVerifiedAt) {
    throw new UnauthorizedError('Verify your email before signing in');
  }

  const publicUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    credits: user.credits,
    emailVerifiedAt: user.emailVerifiedAt,
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
      firstName: true,
      lastName: true,
      role: true,
      credits: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError('Account is no longer available');
  }

  return user;
}

export async function verifyEmail(input: VerifyEmailInput) {
  const tokenHash = hashAuthToken(input.token);
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const token = await transaction.authToken.findUnique({
      where: { tokenHash },
    });

    if (
      !token ||
      token.type !== AuthTokenType.EMAIL_VERIFICATION ||
      token.expiresAt <= now
    ) {
      throw new UnauthorizedError('Verification token is invalid or expired');
    }

    const consumed = await transaction.authToken.deleteMany({
      where: {
        id: token.id,
        type: AuthTokenType.EMAIL_VERIFICATION,
        expiresAt: { gt: now },
      },
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedError('Verification token is invalid or expired');
    }

    return transaction.user.update({
      where: { id: token.userId },
      data: { emailVerifiedAt: now },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        emailVerifiedAt: true,
      },
    });
  });
}

export async function resendVerificationEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerifiedAt: true, isActive: true },
  });

  if (!user || user.emailVerifiedAt || !user.isActive) return;

  const token = await issueAuthToken(
    user.id,
    AuthTokenType.EMAIL_VERIFICATION,
    24 * 60 * 60 * 1000,
  );
  try {
    await sendVerificationMessage(user.email, token);
  } catch {
    console.error('[ERROR] Could not deliver an email verification message');
  }
}

async function sendVerificationMessage(email: string, token: string) {
  const verifyRequest = `${env.APP_BASE_URL}/api/v1/auth/verify-email`;
  await sendAuthEmail(
    email,
    'Verify your AI Image API account',
    `Your verification token is:\n${token}\n\nVerify it with POST ${verifyRequest} and JSON body: {"token":"${token}"}. The token expires in 24 hours.`,
  );
}

export async function requestPasswordReset(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, isActive: true },
  });

  if (!user || !user.isActive) return;

  const token = await issueAuthToken(
    user.id,
    AuthTokenType.PASSWORD_RESET,
    30 * 60 * 1000,
  );
  const resetRequest = `${env.APP_BASE_URL}/api/v1/auth/password/reset`;

  try {
    await sendAuthEmail(
      user.email,
      'Reset your AI Image API password',
      `Your password reset token is:\n${token}\n\nReset it with POST ${resetRequest} and JSON body: {"token":"${token}","password":"your-new-password"}. The token expires in 30 minutes.`,
    );
  } catch {
    // Keep the response indistinguishable for existing and unknown email addresses.
    console.error('[ERROR] Could not deliver a password reset message');
  }
}

export async function resetPassword(input: ResetPasswordInput) {
  const passwordHash = await hash(input.password, 12);
  const tokenHash = hashAuthToken(input.token);
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const token = await transaction.authToken.findUnique({
      where: { tokenHash },
    });

    if (
      !token ||
      token.type !== AuthTokenType.PASSWORD_RESET ||
      token.expiresAt <= now
    ) {
      throw new UnauthorizedError('Password reset token is invalid or expired');
    }

    const consumed = await transaction.authToken.deleteMany({
      where: {
        id: token.id,
        type: AuthTokenType.PASSWORD_RESET,
        expiresAt: { gt: now },
      },
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedError('Password reset token is invalid or expired');
    }

    await transaction.authToken.deleteMany({ where: { userId: token.userId } });
    return transaction.user.update({
      where: { id: token.userId },
      data: { passwordHash },
      select: { id: true },
    });
  });
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user || !(await compare(input.currentPassword, user.passwordHash))) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  const passwordHash = await hash(input.newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      name: `${input.firstName} ${input.lastName}`,
    },
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      lastName: true,
      role: true,
      credits: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  });
}

export async function deleteAccount(userId: string, input: DeleteAccountInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      passwordHash: true,
      assets: { select: { publicId: true } },
    },
  });

  if (!user || !(await compare(input.password, user.passwordHash))) {
    throw new UnauthorizedError('Password confirmation failed');
  }

  try {
    for (const asset of user.assets) await deleteImage(asset.publicId);
  } catch {
    throw new ExternalServiceError(
      'Could not remove stored images; the account was not deleted',
    );
  }

  await prisma.user.delete({ where: { id: userId } });
}
