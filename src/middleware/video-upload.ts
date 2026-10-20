import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import { ValidationError } from '../utils/api-error.js';

export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_VIDEO_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
  },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype !== 'video/mp4') {
      callback(new ValidationError('Only MP4 videos are supported'));
      return;
    }
    callback(null, true);
  },
}).single('video');

export async function parseVideoUpload(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  videoUpload(request, response, async (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Video must be no larger than ${MAX_VIDEO_BYTES / (1024 * 1024)} MB`
          : 'Upload exactly one video file using the video field';
      next(new ValidationError(message));
      return;
    }
    if (error) {
      next(error);
      return;
    }
    if (!request.file) {
      next(new ValidationError('Choose an MP4 video file in the video field'));
      return;
    }

    try {
      const type = await fileTypeFromBuffer(request.file.buffer);
      if (!type || type.ext !== 'mp4' || type.mime !== 'video/mp4') {
        next(new ValidationError('The uploaded file is not a valid MP4 video'));
        return;
      }
      next();
    } catch (validationError) {
      next(validationError);
    }
  });
}
