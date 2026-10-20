import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';
import { env } from '../config/env.js';
import { ExternalServiceError } from '../utils/api-error.js';

const isConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET,
);

export function isCloudinaryConfigured() {
  return isConfigured;
}

// Avoid initializing the SDK with empty credentials during local development.
if (isConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function ensureConfigured() {
  // Fail at the point of use so unrelated API routes can run without Cloudinary.
  if (!isConfigured) {
    throw new ExternalServiceError('Cloudinary is not configured');
  }
}

export async function uploadImage(
  source: string,
  folder = 'ai-image-generator',
) {
  ensureConfigured();

  try {
    return await cloudinary.uploader.upload(source, {
      folder,
      resource_type: 'image',
      unique_filename: true,
    });
  } catch {
    throw new ExternalServiceError('Cloudinary image upload failed');
  }
}

export async function uploadImageBuffer(
  buffer: Buffer,
  publicId: string,
  format: string,
) {
  ensureConfigured();

  try {
    return await new Promise<Awaited<ReturnType<typeof uploadImage>>>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            format,
            public_id: publicId,
            unique_filename: false,
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error('Cloudinary returned no image result'));
              return;
            }
            resolve(result);
          },
        );

        Readable.from([buffer]).pipe(uploadStream);
      },
    );
  } catch {
    throw new ExternalServiceError('Cloudinary image upload failed');
  }
}

export async function uploadVideoBuffer(buffer: Buffer, publicId: string) {
  ensureConfigured();

  try {
    return await new Promise<Awaited<ReturnType<typeof uploadImage>>>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            format: 'mp4',
            public_id: publicId,
            unique_filename: false,
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error('Cloudinary returned no video result'));
              return;
            }
            resolve(result);
          },
        );

        Readable.from([buffer]).pipe(uploadStream);
      },
    );
  } catch {
    throw new ExternalServiceError('Cloudinary video upload failed');
  }
}

export async function deleteImage(publicId: string) {
  ensureConfigured();

  try {
    return await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
    });
  } catch {
    throw new ExternalServiceError('Cloudinary image deletion failed');
  }
}

export async function deleteVideo(publicId: string) {
  ensureConfigured();

  try {
    return await cloudinary.uploader.destroy(publicId, {
      resource_type: 'video',
    });
  } catch {
    throw new ExternalServiceError('Cloudinary video deletion failed');
  }
}
