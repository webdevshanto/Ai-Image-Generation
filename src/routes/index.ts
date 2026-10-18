import { Router } from 'express';
import { healthRoutes } from '../modules/health/health.routes.js';
import { v1Router } from './v1/index.js';

export const apiRouter = Router();

// Keep operational checks separate from versioned product endpoints.
apiRouter.use('/health', healthRoutes);
apiRouter.use('/v1', v1Router);
