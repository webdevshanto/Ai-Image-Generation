import { Router } from 'express';
import { creditRoutes } from '../../modules/credits/credit.routes.js';
import { authRoutes } from '../../modules/auth/auth.routes.js';
import { adminRoutes } from '../../modules/admin/admin.routes.js';
import { imageRoutes } from '../../modules/images/image.routes.js';
import { planRoutes } from '../../modules/plans/plan.routes.js';

export const v1Router = Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/plans', planRoutes);
v1Router.use('/credits', creditRoutes);
v1Router.use('/images', imageRoutes);
v1Router.use('/admin', adminRoutes);
