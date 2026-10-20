import { describe, expect, it } from 'vitest';
import { createGenerationSchema } from './generation.schema.js';

describe('create generation schema', () => {
  it('accepts text-to-image input with a default aspect ratio', () => {
    expect(
      createGenerationSchema.parse({
        mode: 'text-to-image',
        prompt: 'A mountain lake at sunrise',
      }),
    ).toEqual({
      mode: 'text-to-image',
      prompt: 'A mountain lake at sunrise',
      aspectRatio: '1:1',
    });
  });

  it('requires an owned source image identifier for image-to-image input', () => {
    expect(
      createGenerationSchema.safeParse({
        mode: 'image-to-image',
        prompt: 'Make the scene look like an oil painting',
      }).success,
    ).toBe(false);

    expect(
      createGenerationSchema.safeParse({
        mode: 'image-to-image',
        sourceImageId: 'source-image-id',
        prompt: 'Make the scene look like an oil painting',
        aspectRatio: '16:9',
      }).success,
    ).toBe(true);
  });

  it('accepts all video modes with their required source and aspect ratio', () => {
    expect(
      createGenerationSchema.parse({
        mode: 'text-to-video',
        prompt: 'A moving scene',
      }),
    ).toMatchObject({ aspectRatio: '16:9' });
    expect(
      createGenerationSchema.safeParse({
        mode: 'image-to-video',
        prompt: 'Animate this image',
        sourceImageId: 'source-id',
        aspectRatio: '9:16',
      }).success,
    ).toBe(true);
    expect(
      createGenerationSchema.safeParse({
        mode: 'video-to-video',
        prompt: 'Transform the scene',
        sourceVideoId: 'video-id',
      }).success,
    ).toBe(true);
    expect(
      createGenerationSchema.safeParse({
        mode: 'video-to-video',
        prompt: 'Transform the scene',
        sourceVideoId: 'video-id',
        aspectRatio: '1:1',
      }).success,
    ).toBe(false);
  });
});
