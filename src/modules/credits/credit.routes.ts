import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { getCreditTransactions, getCredits } from './credit.controller.js';

export const creditRoutes = Router();

creditRoutes.use(authenticate);
creditRoutes.get('/', getCredits);
creditRoutes.get('/history', getCreditTransactions);
