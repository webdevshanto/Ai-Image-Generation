import { Router } from 'express';
import { authorizeAdmin } from '../../middleware/authorize-admin.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate-request.js';
import { createPlanGrant, getPlanGrants } from './plan-grant.controller.js';
import { createPlanGrantSchema } from './plan-grant.schema.js';

export const adminRoutes = Router();

adminRoutes.use(authenticate, authorizeAdmin);
adminRoutes.get('/plan-grants', getPlanGrants);
adminRoutes.post(
  '/plan-grants',
  validateBody(createPlanGrantSchema),
  createPlanGrant,
);
