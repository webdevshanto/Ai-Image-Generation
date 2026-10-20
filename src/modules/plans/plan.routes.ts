import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate-request.js';
import { changeMyPlan, getMyPlan, getPlans } from './plan.controller.js';
import { changePlanSchema } from './plan.schema.js';

export const planRoutes = Router();

planRoutes.get('/', getPlans);
planRoutes.get('/me', authenticate, getMyPlan);
planRoutes.post(
  '/change',
  authenticate,
  validateBody(changePlanSchema),
  changeMyPlan,
);
