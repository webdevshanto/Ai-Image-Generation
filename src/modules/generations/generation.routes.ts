import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate-request.js';
import {
  createGenerationHandler,
  getGenerationHandler,
} from './generation.controller.js';
import { createGenerationSchema } from './generation.schema.js';

export const generationRoutes = Router();

generationRoutes.use(authenticate);
generationRoutes.post(
  '/',
  validateBody(createGenerationSchema),
  createGenerationHandler,
);
generationRoutes.get('/:id', getGenerationHandler);
