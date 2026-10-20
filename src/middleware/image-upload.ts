import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../utils/api-error.js';
import { MAX_IMAGE_BYTES } from '../modules/images/image.validation.js';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
  },
  fileFilter: (_request, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(
        new ValidationError('Only JPEG, PNG, and WebP images are supported'),
      );
      return;
    }
    callback(null, true);
  },
}).single('image');

export function parseImageUpload(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  imageUpload(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Image file must be no larger than ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`
          : 'Upload exactly one image file using the image field';
      next(new ValidationError(message));
      return;
    }

    if (error) {
      next(error);
      return;
    }
    next();
  });
}
