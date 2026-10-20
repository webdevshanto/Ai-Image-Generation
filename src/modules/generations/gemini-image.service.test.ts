import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env.js';
import { ExternalServiceError } from '../../utils/api-error.js';
import { generateGeminiImage } from './gemini-image.service.js';

const originalApiKey = env.GEMINI_API_KEY;
const originalLegacyApiKey = env.IMAGE_PROVIDER_API_KEY;

afterEach(() => {
  env.GEMINI_API_KEY = originalApiKey;
  env.IMAGE_PROVIDER_API_KEY = originalLegacyApiKey;
  vi.unstubAllGlobals();
});

describe('Gemini image generation client', () => {
  it('sends the prompt and extracts returned image bytes', async () => {
    env.GEMINI_API_KEY = 'test-gemini-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          steps: [
            {
              type: 'model_output',
              content: [
                {
                  type: 'image',
                  mime_type: 'image/png',
                  data: Buffer.from('test image').toString('base64'),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateGeminiImage({
      prompt: 'A bright red bicycle',
      aspectRatio: '1:1',
    });

    expect(result).toEqual({
      buffer: Buffer.from('test image'),
      mimeType: 'image/png',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'test-gemini-key',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    expect(JSON.parse(String(request.body))).toEqual({
      model: env.GEMINI_IMAGE_MODEL,
      input: [
        {
          type: 'text',
          text: 'Generate an image with aspect ratio 1:1. A bright red bicycle',
        },
      ],
    });
  });

  it('returns a safe provider error on non-success responses', async () => {
    env.GEMINI_API_KEY = 'test-gemini-key';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('provider detail', { status: 403 })),
    );

    await expect(
      generateGeminiImage({
        prompt: 'A bright red bicycle',
        aspectRatio: '1:1',
      }),
    ).rejects.toMatchObject<Partial<ExternalServiceError>>({
      message: 'Gemini image generation failed with status 403',
    });
  });
});
