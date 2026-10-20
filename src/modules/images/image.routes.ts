import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { parseImageUpload } from '../../middleware/image-upload.js';
import {
  deleteImageHandler,
  getImageHandler,
  listImagesHandler,
  uploadImageHandler,
} from './image.controller.js';

export const imageRoutes = Router();

imageRoutes.use(authenticate);
imageRoutes.post('/', parseImageUpload, uploadImageHandler);
imageRoutes.get('/', listImagesHandler);
imageRoutes.get('/:id', getImageHandler);
imageRoutes.delete('/:id', deleteImageHandler);
