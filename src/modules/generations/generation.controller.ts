import type { RequestHandler } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response.js';
import type { CreateGenerationInput } from './generation.schema.js';
import {
  createUserGeneration,
  getUserGeneration,
} from './generation.service.js';

export const createGenerationHandler: RequestHandler = async (req, res) => {
  const generation = await createUserGeneration(
    req.user!.id,
    req.body as CreateGenerationInput,
  );
  return sendSuccess(
    req,
    res,
    'Image generation was queued.',
    { generation },
    202,
  );
};

export const getGenerationHandler: RequestHandler = async (req, res) => {
  const generationId = z.string().trim().min(1).max(128).parse(req.params.id);
  const generation = await getUserGeneration(req.user!.id, generationId);
  return sendSuccess(req, res, 'Generation status is ready.', { generation });
};
