import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { sendSuccess } from '../../utils/api-response.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';
import { findCurrentUser, loginUser, registerUser } from './auth.service.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export const register: RequestHandler = async (req, res) => {
  const result = await registerUser(req.body as RegisterInput);
  res.cookie('token', result.token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 1000,
  });
  return sendSuccess(req, res, 'Account created', { user: result.user }, 201);
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
