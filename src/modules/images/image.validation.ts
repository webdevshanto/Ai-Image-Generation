import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { ValidationError } from '../../utils/api-error.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 4096;
export const MAX_IMAGE_PIXELS = 16_000_000;

const supportedFormats = new Set(['jpg', 'png', 'webp']);

export async function inspectUploadedImage(buffer: Buffer) {
  if (buffer.length === 0) {
    throw new ValidationError('The uploaded image is empty');
  }

  const detectedType = await fileTypeFromBuffer(buffer);
  if (!detectedType || !supportedFormats.has(detectedType.ext)) {
    throw new ValidationError('Only JPEG, PNG, and WebP images are supported');
  }

  const metadata = await sharp(buffer, {
    limitInputPixels: MAX_IMAGE_PIXELS,
    failOn: 'error',
  })
    .metadata()
    .catch(() => {
      throw new ValidationError('The uploaded file is not a valid image');
    });

  const normalizedFormat =
    detectedType.ext === 'jpg' ? 'jpeg' : detectedType.ext;
  if (
    metadata.format !== normalizedFormat ||
    !metadata.width ||
    !metadata.height ||
    (metadata.pages !== undefined && metadata.pages > 1)
  ) {
    throw new ValidationError('The uploaded file is not a supported image');
  }

  if (
    metadata.width > MAX_IMAGE_DIMENSION ||
    metadata.height > MAX_IMAGE_DIMENSION ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS
  ) {
    throw new ValidationError(
      `Images must be no larger than ${MAX_IMAGE_DIMENSION} x ${MAX_IMAGE_DIMENSION} pixels`,
    );
  }

  return {
    format: normalizedFormat,
    mimeType: detectedType.mime,
    width: metadata.width,
    height: metadata.height,
  };
}
