import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env.js';
import { ExternalServiceError } from '../../utils/api-error.js';
import { generateGeminiVideo } from './gemini-video.service.js';

const originalApiKey = env.GEMINI_API_KEY;

afterEach(() => {
  env.GEMINI_API_KEY = originalApiKey;
  vi.unstubAllGlobals();
});

describe('Gemini video generation client', () => {
  it('sends video interaction input and extracts the MP4 output', async () => {
    env.GEMINI_API_KEY = 'test-gemini-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          steps: [
            {
              type: 'model_output',
              content: [
                {
                  type: 'video',
                  mime_type: 'video/mp4',
                  data: Buffer.from('video bytes').toString('base64'),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateGeminiVideo({
      prompt: 'A moving scene',
      aspectRatio: '16:9',
      sourceImage: {
        mimeType: 'image/png',
        buffer: Buffer.from('source image'),
      },
    });

    expect(result).toEqual({
      buffer: Buffer.from('video bytes'),
      mimeType: 'video/mp4',
    });
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: env.GEMINI_VIDEO_MODEL,
      input: [
        { type: 'text', text: 'A moving scene' },
        { type: 'image', mime_type: 'image/png' },
      ],
      response_format: { type: 'video', aspect_ratio: '16:9' },
    });
    expect(request.headers).toMatchObject({
      'x-goog-api-key': 'test-gemini-key',
    });
  });

  it('rejects responses without an MP4 output', async () => {
    env.GEMINI_API_KEY = 'test-gemini-key';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ steps: [] }), { status: 200 }),
        ),
    );
    await expect(
      generateGeminiVideo({
        prompt: 'A moving scene',
        aspectRatio: '16:9',
      }),
    ).rejects.toMatchObject<Partial<ExternalServiceError>>({
      message: 'Gemini did not return an MP4 video',
    });
  });
});
