import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate-request.js';
import {
  changePasswordHandler,
  deleteAccountHandler,
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  register,
  refreshSessionHandler,
  resetPasswordHandler,
  updateProfileHandler,
  verifyEmailAddress,
} from './auth.controller.js';
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from './auth-input.schema.js';
import { loginSchema, registerSchema } from './auth.schema.js';
import {
  emailChangeLimiter,
  refreshTokenLimiter,
  registrationOtpLimiter,
  verificationOtpLimiter,
} from './auth-rate-limit.js';

export const authRoutes = Router();

authRoutes.post(
  '/register',
  ...registrationOtpLimiter,
  validateBody(registerSchema),
  register,
);
authRoutes.post('/login', validateBody(loginSchema), login);
authRoutes.post('/refresh', ...refreshTokenLimiter, refreshSessionHandler);
authRoutes.post(
  '/verify-email',
  ...verificationOtpLimiter,
  validateBody(verifyEmailSchema),
  verifyEmailAddress,
);
authRoutes.post(
  '/password/forgot',
  validateBody(forgotPasswordSchema),
  forgotPassword,
);
authRoutes.post(
  '/password/reset',
  validateBody(resetPasswordSchema),
  resetPasswordHandler,
);
authRoutes.post('/logout', logout);
authRoutes.get('/me', authenticate, getCurrentUser);
authRoutes.patch(
  '/password',
  authenticate,
  validateBody(changePasswordSchema),
  changePasswordHandler,
);
authRoutes.patch(
  '/me',
  authenticate,
  validateBody(updateProfileSchema),
  ...emailChangeLimiter,
  updateProfileHandler,
);
authRoutes.delete(
  '/me',
  authenticate,
  validateBody(deleteAccountSchema),
  deleteAccountHandler,
);
