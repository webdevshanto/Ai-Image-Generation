import { z } from 'zod';

const aspectRatios = ['1:1', '3:2', '4:3', '16:9', '9:16'] as const;

export const createGenerationSchema = z
  .object({
    mode: z.enum([
      'text-to-image',
      'image-to-image',
      'text-to-video',
      'image-to-video',
      'video-to-video',
    ]),
    prompt: z.string().trim().min(3).max(4000),
    sourceImageId: z.string().trim().min(1).max(128).optional(),
    sourceVideoId: z.string().trim().min(1).max(128).optional(),
    aspectRatio: z.enum(aspectRatios).optional(),
  })
  .transform((input) => ({
    ...input,
    aspectRatio:
      input.aspectRatio ?? (input.mode.endsWith('video') ? '16:9' : '1:1'),
  }))
  .refine(
    (input) => {
      const requiresImage =
        input.mode === 'image-to-image' || input.mode === 'image-to-video';
      const requiresVideo = input.mode === 'video-to-video';
      return (
        (requiresImage ? Boolean(input.sourceImageId) : !input.sourceImageId) &&
        (requiresVideo ? Boolean(input.sourceVideoId) : !input.sourceVideoId) &&
        (!input.mode.endsWith('video') ||
          input.aspectRatio === '16:9' ||
          input.aspectRatio === '9:16')
      );
    },
    {
      message:
        'Image-to-Image and Image-to-Video require sourceImageId; Video-to-Video requires sourceVideoId; video aspect ratio must be 16:9 or 9:16',
      path: ['mode'],
    },
  );

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
