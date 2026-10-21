import { compare, hash } from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { AuthTokenType } from '../../generated/prisma/client.js';
import { sendAuthEmail } from '../../services/email.service.js';
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/api-error.js';
import { isAllowedEmailProvider } from './email-policy.js';
import {
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  generateVerificationCode,
  hashAuthToken,
  issueAuthToken,
  issueVerificationCode,
} from './auth-token.js';
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

export function createAccessToken(user: { id: string; email: string }) {
  return jwt.sign({ email: user.email }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
  });
}

function createRefreshToken() {
  return randomBytes(64).toString('base64url');
}

function toPublicUser(user: {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerifiedAt: user.emailVerifiedAt,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt,
  };
}

export async function registerUser(input: RegisterInput) {
  const emailSent = await requestRegistrationEmailVerification(input);
  return { email: input.email, emailSent };
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
    emailVerifiedAt: user.emailVerifiedAt,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt,
  };

  const refreshToken = createRefreshToken();
  await prisma.authToken.create({
    data: {
      userId: user.id,
      type: AuthTokenType.REFRESH_TOKEN,
      tokenHash: hashAuthToken(refreshToken),
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return {
    user: publicUser,
    accessToken: createAccessToken(user),
    refreshToken,
  };
}

export async function rotateRefreshToken(refreshToken: string) {
  const tokenHash = hashAuthToken(refreshToken);
  const now = new Date();

  const result = await prisma.$transaction(async (transaction) => {
    const storedToken = await transaction.authToken.findUnique({
      where: { tokenHash },
    });

    if (
      !storedToken ||
      storedToken.type !== AuthTokenType.REFRESH_TOKEN ||
      !storedToken.familyId
    ) {
      return { status: 'invalid' as const };
    }

    if (storedToken.revokedAt) {
      await transaction.authToken.updateMany({
        where: {
          userId: storedToken.userId,
          type: AuthTokenType.REFRESH_TOKEN,
          familyId: storedToken.familyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      return { status: 'replayed' as const };
    }

    if (storedToken.expiresAt <= now) {
      return { status: 'invalid' as const };
    }

    const user = await transaction.user.findUnique({
      where: { id: storedToken.userId },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        isActive: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    if (!user || !user.isActive || !user.emailVerifiedAt) {
      await transaction.authToken.updateMany({
        where: {
          userId: storedToken.userId,
          type: AuthTokenType.REFRESH_TOKEN,
          familyId: storedToken.familyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      return { status: 'invalid' as const };
    }

    const consumed = await transaction.authToken.updateMany({
      where: {
        id: storedToken.id,
        type: AuthTokenType.REFRESH_TOKEN,
        expiresAt: { gt: now },
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    if (consumed.count !== 1) {
      await transaction.authToken.updateMany({
        where: {
          userId: storedToken.userId,
          type: AuthTokenType.REFRESH_TOKEN,
          familyId: storedToken.familyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      return { status: 'replayed' as const };
    }

    const nextRefreshToken = createRefreshToken();
    await transaction.authToken.create({
      data: {
        userId: user.id,
        type: AuthTokenType.REFRESH_TOKEN,
        tokenHash: hashAuthToken(nextRefreshToken),
        familyId: storedToken.familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      status: 'rotated' as const,
      user: toPublicUser(user),
      accessToken: createAccessToken(user),
      refreshToken: nextRefreshToken,
    };
  });

  if (result.status !== 'rotated') {
    throw new UnauthorizedError('Refresh session is invalid or expired');
  }
  return result;
}

export async function revokeRefreshToken(refreshToken?: string) {
  if (!refreshToken) return;
  const storedToken = await prisma.authToken.findUnique({
    where: { tokenHash: hashAuthToken(refreshToken) },
    select: { userId: true, type: true, familyId: true },
  });
  if (!storedToken || storedToken.type !== AuthTokenType.REFRESH_TOKEN) return;

  await prisma.authToken.updateMany({
    where: {
      userId: storedToken.userId,
      type: AuthTokenType.REFRESH_TOKEN,
      familyId: storedToken.familyId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
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
      emailVerifiedAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError('Account is no longer available');
  }

  return { ...user, emailVerified: Boolean(user.emailVerifiedAt) };
}

export async function verifyEmail(input: VerifyEmailInput) {
  const tokenHash = hashAuthToken(input.otp);
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const token = await transaction.authToken.findUnique({
      where: { tokenHash },
    });

    if (token) {
      if (
        token.type !== AuthTokenType.EMAIL_VERIFICATION ||
        token.expiresAt <= now
      ) {
        throw new UnauthorizedError('Verification code is invalid or expired');
      }

      const user = await transaction.user.findUnique({
        where: { id: token.userId },
        select: { email: true },
      });

      if (user?.email !== input.email) {
        throw new UnauthorizedError('Verification code is invalid or expired');
      }

      const consumed = await transaction.authToken.deleteMany({
        where: {
          id: token.id,
          type: AuthTokenType.EMAIL_VERIFICATION,
          expiresAt: { gt: now },
        },
      });

      if (consumed.count !== 1) {
        throw new UnauthorizedError('Verification code is invalid or expired');
      }

      const verifiedUser = await transaction.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: now },
        select: { email: true },
      });
      return { email: verifiedUser.email };
    }

    const challenge = await transaction.emailVerificationChallenge.findUnique({
      where: { email: input.email },
    });
    if (
      !challenge ||
      challenge.otpHash !== tokenHash ||
      challenge.expiresAt <= now ||
      !challenge.firstName ||
      !challenge.lastName ||
      !challenge.passwordHash
    ) {
      throw new UnauthorizedError('Verification code is invalid or expired');
    }

    const consumed = await transaction.emailVerificationChallenge.deleteMany({
      where: {
        email: input.email,
        otpHash: tokenHash,
        expiresAt: { gt: now },
      },
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedError('Verification code is invalid or expired');
    }

    try {
      const user = await transaction.user.create({
        data: {
          email: challenge.email,
          firstName: challenge.firstName,
          lastName: challenge.lastName,
          name: `${challenge.firstName} ${challenge.lastName}`,
          passwordHash: challenge.passwordHash,
          emailVerifiedAt: now,
        },
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          emailVerifiedAt: true,
          createdAt: true,
        },
      });
      return { user: { ...user, emailVerified: true } };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError('An account with this email already exists');
      }
      throw error;
    }
  });
}

async function requestRegistrationEmailVerification(input: RegisterInput) {
  if (!isAllowedEmailProvider(input.email)) {
    throw new ValidationError(
      'Use a Gmail, Outlook, or Yahoo email address. Disposable email is not accepted.',
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (user) {
    throw new ConflictError('An account with this email already exists');
  }

  const code = generateVerificationCode();
  const passwordHash = await hash(input.password, 12);
  await prisma.emailVerificationChallenge.upsert({
    where: { email: input.email },
    update: {
      otpHash: hashAuthToken(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
    },
    create: {
      email: input.email,
      otpHash: hashAuthToken(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
    },
  });
  try {
    await sendVerificationMessage(
      input.email,
      code,
      15 * 60 * 1000,
      'registration',
    );
    return true;
  } catch {
    console.error('[ERROR] Could not deliver an email verification message');
    return false;
  }
}

async function sendVerificationMessage(
  email: string,
  code: string,
  expiresInMs: number,
  purpose: 'registration' | 'email-change',
) {
  const expiresInMinutes = Math.floor(expiresInMs / (60 * 1000));
  const instructions =
    purpose === 'registration'
      ? `Use it in POST ${env.APP_BASE_URL}/api/v1/auth/verify-email with JSON body: {"email":"${email}","otp":"${code}"}. The account will be created after the code is verified.`
      : `Use it in POST ${env.APP_BASE_URL}/api/v1/auth/verify-email with JSON body: {"email":"${email}","otp":"${code}"}.`;
  await sendAuthEmail(
    email,
    'Verify your AI Image API account',
    `Your verification code is: ${code}\n\n${instructions} The code expires in ${expiresInMinutes} minutes.`,
  );
}

export async function requestPasswordReset(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, isActive: true },
  });

  if (!user || !user.isActive) return;

  const code = generateVerificationCode();
  const token = await issueAuthToken(
    user.id,
    AuthTokenType.PASSWORD_RESET,
    30 * 60 * 1000,
    code,
  );
  const resetRequest = `${env.APP_BASE_URL}/api/v1/auth/password/reset`;

  try {
    await sendAuthEmail(
      user.email,
      'Reset your AI Image API password',
      `Your password reset code is: ${token}\n\nReset your password with POST ${resetRequest} and JSON body: {"otp":"${token}","password":"your-new-password"}. The code expires in 30 minutes.`,
    );
  } catch {
    // Keep the response indistinguishable for existing and unknown email addresses.
    console.error('[ERROR] Could not deliver a password reset message');
  }
}

export async function resetPassword(input: ResetPasswordInput) {
  const passwordHash = await hash(input.password, 12);
  const tokenHash = hashAuthToken(input.otp);
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
      throw new UnauthorizedError('Password reset code is invalid or expired');
    }

    const consumed = await transaction.authToken.deleteMany({
      where: {
        id: token.id,
        type: AuthTokenType.PASSWORD_RESET,
        expiresAt: { gt: now },
      },
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedError('Password reset code is invalid or expired');
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
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.authToken.updateMany({
      where: {
        userId,
        type: AuthTokenType.REFRESH_TOKEN,
        revokedAt: null,
      },
      data: { revokedAt: now },
    }),
  ]);
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const emailChanged = existingUser?.email !== input.email;
  if (emailChanged && !isAllowedEmailProvider(input.email)) {
    throw new ValidationError(
      'Use a Gmail, Outlook, or Yahoo email address. Disposable email is not accepted.',
    );
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        name: `${input.firstName} ${input.lastName}`,
        email: input.email,
        ...(emailChanged && { emailVerifiedAt: null }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
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

  let verificationEmailSent: boolean | null = null;
  if (emailChanged) {
    const code = await issueVerificationCode(userId, 24 * 60 * 60 * 1000);
    try {
      await sendVerificationMessage(
        user.email,
        code,
        24 * 60 * 60 * 1000,
        'email-change',
      );
      verificationEmailSent = true;
    } catch {
      verificationEmailSent = false;
      console.error('[ERROR] Could not deliver an email verification message');
    }
  }

  return {
    user: { ...user, emailVerified: Boolean(user.emailVerifiedAt) },
    emailChanged,
    verificationEmailSent,
  };
}

export async function deleteAccount(userId: string, input: DeleteAccountInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      passwordHash: true,
    },
  });

  if (!user || !(await compare(input.password, user.passwordHash))) {
    throw new UnauthorizedError('Password confirmation failed');
  }

  await prisma.user.delete({ where: { id: userId } });
}
