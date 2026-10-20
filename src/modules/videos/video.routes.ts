import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { parseVideoUpload } from '../../middleware/video-upload.js';
import {
  deleteVideoHandler,
  getVideoHandler,
  listVideosHandler,
  uploadVideoHandler,
} from './video.controller.js';

export const videoRoutes = Router();

videoRoutes.use(authenticate);
videoRoutes.post('/', parseVideoUpload, uploadVideoHandler);
videoRoutes.get('/', listVideosHandler);
videoRoutes.get('/:id', getVideoHandler);
videoRoutes.delete('/:id', deleteVideoHandler);
