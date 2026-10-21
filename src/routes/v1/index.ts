import { Router } from 'express';
import { authRoutes } from '../../modules/auth/auth.routes.js';

export const v1Router = Router();

v1Router.use('/auth', authRoutes);
