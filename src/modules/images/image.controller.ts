import type { RequestHandler } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response.js';
import {
  deleteUserImage,
  getUserImage,
  listUserImages,
  uploadUserImage,
} from './image.service.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const imageIdSchema = z.string().trim().min(1).max(128);

export const uploadImageHandler: RequestHandler = async (req, res) => {
  const image = await uploadUserImage(req.user!.id, req.file);
  return sendSuccess(
    req,
    res,
    'Image uploaded to your library.',
    { image },
    201,
  );
};

export const listImagesHandler: RequestHandler = async (req, res) => {
  const pagination = paginationSchema.parse(req.query);
  const result = await listUserImages(
    req.user!.id,
    pagination.page,
    pagination.limit,
  );
  return sendSuccess(req, res, 'Your image library is ready.', result);
};

export const getImageHandler: RequestHandler = async (req, res) => {
  const imageId = imageIdSchema.parse(req.params.id);
  const image = await getUserImage(req.user!.id, imageId);
  return sendSuccess(req, res, 'Image details are ready.', { image });
};

export const deleteImageHandler: RequestHandler = async (req, res) => {
  const imageId = imageIdSchema.parse(req.params.id);
  await deleteUserImage(req.user!.id, imageId);
  return sendSuccess(req, res, 'Image removed from your library.', null);
};
