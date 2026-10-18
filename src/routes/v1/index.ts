import { Router } from 'express';
import { authRoutes } from '../../modules/auth/auth.routes.js';
import { apiRateLimit, authRateLimit } from '../../middleware/rate-limits.js';

export const v1Router = Router();

// Apply the general API budget before mounting feature-specific routes.
v1Router.use(apiRateLimit);
v1Router.use('/auth', authRateLimit, authRoutes);
