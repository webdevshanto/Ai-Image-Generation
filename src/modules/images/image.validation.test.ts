import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { inspectUploadedImage } from './image.validation.js';

describe('inspectUploadedImage', () => {
  it('accepts a valid PNG and reports its metadata', async () => {
    const buffer = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 3,
        background: '#336699',
      },
    })
      .png()
      .toBuffer();

    await expect(inspectUploadedImage(buffer)).resolves.toMatchObject({
      format: 'png',
      mimeType: 'image/png',
      width: 12,
      height: 8,
    });
  });

  it('accepts JPEG metadata even though signature tools call it jpg', async () => {
    const buffer = await sharp({
      create: {
        width: 9,
        height: 7,
        channels: 3,
        background: '#663399',
      },
    })
      .jpeg()
      .toBuffer();

    await expect(inspectUploadedImage(buffer)).resolves.toMatchObject({
      format: 'jpeg',
      mimeType: 'image/jpeg',
      width: 9,
      height: 7,
    });
  });

  it('rejects empty, non-image, and unsupported image data', async () => {
    await expect(inspectUploadedImage(Buffer.alloc(0))).rejects.toThrow(
      'empty',
    );
    await expect(
      inspectUploadedImage(Buffer.from('not an image')),
    ).rejects.toThrow('Only JPEG, PNG, and WebP images are supported');
  });

  it('rejects images that exceed the pixel budget', async () => {
    const buffer = await sharp({
      create: {
        width: 4097,
        height: 1,
        channels: 3,
        background: '#336699',
      },
    })
      .png()
      .toBuffer();

    await expect(inspectUploadedImage(buffer)).rejects.toThrow(
      'Images must be no larger than',
    );
  });
});
