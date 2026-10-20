import { env, getGeminiApiKey } from '../../config/env.js';
import { ExternalServiceError } from '../../utils/api-error.js';

type VideoContentPart = {
  type?: string;
  mime_type?: string;
  data?: string;
};

type VideoInteractionResponse = {
  steps?: Array<{
    type?: string;
    content?: VideoContentPart[];
  }>;
  output_video?: VideoContentPart;
};

const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_VIDEO_RESPONSE_BYTES = 100 * 1024 * 1024;

export async function generateGeminiVideo(input: {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  sourceImage?: { mimeType: string; buffer: Buffer };
  sourceVideo?: { mimeType: string; buffer: Buffer };
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new ExternalServiceError('Gemini video generation is not configured');
  }

  const parts: Array<Record<string, string>> = [
    { type: 'text', text: input.prompt },
  ];
  if (input.sourceImage) {
    parts.push({
      type: 'image',
      mime_type: input.sourceImage.mimeType,
      data: input.sourceImage.buffer.toString('base64'),
    });
  }
  if (input.sourceVideo) {
    parts.push({
      type: 'video',
      mime_type: input.sourceVideo.mimeType,
      data: input.sourceVideo.buffer.toString('base64'),
    });
  }

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: env.GEMINI_VIDEO_MODEL,
        input: parts.length === 1 ? input.prompt : parts,
        response_format: {
          type: 'video',
          aspect_ratio: input.aspectRatio,
        },
      }),
      signal: AbortSignal.timeout(env.GENERATION_TIMEOUT_MS),
    });
  } catch {
    throw new ExternalServiceError('Gemini video generation request failed');
  }

  if (!response.ok) {
    throw new ExternalServiceError(
      `Gemini video generation failed with status ${response.status}`,
    );
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_VIDEO_RESPONSE_BYTES
  ) {
    throw new ExternalServiceError('Gemini video response is too large');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ExternalServiceError('Gemini returned an empty video response');
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_VIDEO_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ExternalServiceError('Gemini video response is too large');
    }
    chunks.push(Buffer.from(value));
  }

  let result: VideoInteractionResponse;
  try {
    result = JSON.parse(
      Buffer.concat(chunks).toString('utf8'),
    ) as VideoInteractionResponse;
  } catch {
    throw new ExternalServiceError('Gemini returned an invalid video response');
  }

  const videoPart = [
    ...(result.steps
      ?.filter((step) => step.type === 'model_output')
      .flatMap((step) => step.content ?? []) ?? []),
    ...(result.output_video ? [result.output_video] : []),
  ].find((part) => part.type === 'video' && part.data && part.mime_type);

  if (!videoPart?.data || videoPart.mime_type !== 'video/mp4') {
    throw new ExternalServiceError('Gemini did not return an MP4 video');
  }

  const video = Buffer.from(videoPart.data, 'base64');
  if (video.length === 0 || video.length > MAX_VIDEO_RESPONSE_BYTES) {
    throw new ExternalServiceError(
      'Gemini returned an empty or oversized video',
    );
  }
  return { buffer: video, mimeType: videoPart.mime_type };
}
