import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
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
import {
  changePassword,
  deleteAccount,
  findCurrentUser,
  loginUser,
  registerUser,
  requestPasswordReset,
  resendVerificationEmail,
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

export const register: RequestHandler = async (req, res) => {
  const result = await registerUser(req.body as RegisterInput);
  return sendSuccess(
    req,
    res,
    result.emailSent
      ? 'Account created. Verify your email before signing in.'
      : 'Account created, but verification email could not be sent. Request another email to continue.',
    {
      user: result.user,
      emailVerificationRequired: true,
      emailSent: result.emailSent,
    },
    201,
  );
};

export const login: RequestHandler = async (req, res) => {
  const result = await loginUser(req.body as LoginInput);
  res.cookie('token', result.token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 1000,
  });
  return sendSuccess(req, res, 'Signed in', { user: result.user });
};

export const logout: RequestHandler = (req, res) => {
  res.clearCookie('token', cookieOptions);
  return sendSuccess(req, res, 'Signed out', null);
};

export const getCurrentUser: RequestHandler = async (req, res) => {
  const user = await findCurrentUser(req.user!.id);
  return sendSuccess(req, res, 'Current account', { user });
};

export const verifyEmailAddress: RequestHandler = async (req, res) => {
  const user = await verifyEmail(req.body as VerifyEmailInput);
  return sendSuccess(req, res, 'Email verified', { user });
};

export const resendVerification: RequestHandler = async (req, res) => {
  const body = req.body as ForgotPasswordInput;
  await resendVerificationEmail(body.email);
  return sendSuccess(
    req,
    res,
    'If the account needs verification, an email was sent',
    null,
  );
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
  return sendSuccess(req, res, 'Password reset successfully', null);
};

export const changePasswordHandler: RequestHandler = async (req, res) => {
  await changePassword(req.user!.id, req.body as ChangePasswordInput);
  return sendSuccess(req, res, 'Password changed successfully', null);
};

export const updateProfileHandler: RequestHandler = async (req, res) => {
  const user = await updateProfile(
    req.user!.id,
    req.body as UpdateProfileInput,
  );
  return sendSuccess(req, res, 'Profile updated', { user });
};

export const deleteAccountHandler: RequestHandler = async (req, res) => {
  await deleteAccount(req.user!.id, req.body as DeleteAccountInput);
  res.clearCookie('token', cookieOptions);
  return sendSuccess(req, res, 'Account deleted', null);
};
