import type { RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../utils/api-error.js';
import { sendSuccess } from '../../utils/api-response.js';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  UpdateProfileInput,
  VerifyEmailInput,
} from './auth-input.schema.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from './auth-token.js';
import {
  changePassword,
  createAccessToken,
  deleteAccount,
  findCurrentUser,
  loginUser,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
  requestPasswordReset,
  resetPassword,
  updateProfile,
  verifyEmail,
} from './auth.service.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

const refreshCookieOptions = {
  ...cookieOptions,
  path: '/api/v1/auth',
};

function setSessionCookies(
  response: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  response.cookie('token', tokens.accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_TTL_MS,
  });
  response.cookie('refreshToken', tokens.refreshToken, {
    ...refreshCookieOptions,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearSessionCookies(response: Response) {
  response.clearCookie('token', cookieOptions);
  response.clearCookie('refreshToken', refreshCookieOptions);
}

export const register: RequestHandler = async (req, res) => {
  const result = await registerUser(req.body as RegisterInput);
  return sendSuccess(
    req,
    res,
    result.emailSent
      ? 'Verification code sent. Verify your email to create the account.'
      : 'Registration saved, but the verification email could not be sent. Submit the request again to retry.',
    { email: result.email, emailVerificationRequired: true },
    202,
  );
};

export const login: RequestHandler = async (req, res) => {
  const result = await loginUser(req.body as LoginInput);
  setSessionCookies(res, result);
  return sendSuccess(req, res, 'Signed in', { user: result.user });
};

export const refreshSessionHandler: RequestHandler = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (typeof refreshToken !== 'string') {
    throw new UnauthorizedError('Refresh session is invalid or expired');
  }

  const result = await rotateRefreshToken(refreshToken);
  setSessionCookies(res, result);
  return sendSuccess(req, res, 'Session refreshed', { user: result.user });
};

export const logout: RequestHandler = async (req, res) => {
  await revokeRefreshToken(req.cookies?.refreshToken);
  clearSessionCookies(res);
  return sendSuccess(req, res, 'Signed out', null);
};

export const getCurrentUser: RequestHandler = async (req, res) => {
  const user = await findCurrentUser(req.user!.id);
  return sendSuccess(req, res, 'Current account', { user });
};

export const verifyEmailAddress: RequestHandler = async (req, res) => {
  const result = await verifyEmail(req.body as VerifyEmailInput);
  if ('user' in result) {
    return sendSuccess(
      req,
      res,
      'Email verified and account created',
      { user: result.user },
      201,
    );
  }

  return sendSuccess(req, res, 'Email verified', {
    email: result.email,
    emailVerified: true,
  });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await requestPasswordReset(req.body as ForgotPasswordInput);
  return sendSuccess(
    req,
    res,
    'If an account exists for that email, password reset instructions were sent',
    null,
  );
};

export const resetPasswordHandler: RequestHandler = async (req, res) => {
  await resetPassword(req.body as ResetPasswordInput);
  clearSessionCookies(res);
  return sendSuccess(req, res, 'Password reset successfully', null);
};

export const changePasswordHandler: RequestHandler = async (req, res) => {
  await changePassword(req.user!.id, req.body as ChangePasswordInput);
  clearSessionCookies(res);
  return sendSuccess(req, res, 'Password changed successfully', null);
};

export const updateProfileHandler: RequestHandler = async (req, res) => {
  const user = await updateProfile(
    req.user!.id,
    req.body as UpdateProfileInput,
  );
  if (req.user!.email !== user.email) {
    res.cookie('token', createAccessToken(user), {
      ...cookieOptions,
      maxAge: ACCESS_TOKEN_TTL_MS,
    });
  }
  return sendSuccess(req, res, 'Profile updated', { user });
};

export const deleteAccountHandler: RequestHandler = async (req, res) => {
  await deleteAccount(req.user!.id, req.body as DeleteAccountInput);
  clearSessionCookies(res);
  return sendSuccess(req, res, 'Account deleted', null);
};
