import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate-request.js';
import { getCurrentUser, login, logout, register } from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schema.js';

export const authRoutes = Router();

authRoutes.post('/register', validateBody(registerSchema), register);
authRoutes.post('/login', validateBody(loginSchema), login);
authRoutes.post('/logout', logout);
authRoutes.get('/me', authenticate, getCurrentUser);
