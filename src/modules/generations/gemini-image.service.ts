import { env, getGeminiApiKey } from '../../config/env.js';
import {
  ExternalServiceError,
  ValidationError,
} from '../../utils/api-error.js';

type GeminiInlineData = {
  mimeType?: string;
  mime_type?: string;
  data?: string;
};

type GeminiPart = {
  type?: string;
  data?: string;
  mimeType?: string;
  mime_type?: string;
  inlineData?: GeminiInlineData;
  inline_data?: GeminiInlineData;
};

type GeminiResponse = {
  outputs?: GeminiPart[];
  output_image?: GeminiPart;
  steps?: Array<{ type?: string; content?: GeminiPart[] }>;
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  promptFeedback?: { blockReason?: string };
};

const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export async function generateGeminiImage(input: {
  prompt: string;
  aspectRatio: string;
  sourceImage?: { mimeType: string; buffer: Buffer };
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new ExternalServiceError('Gemini image generation is not configured');
  }

  const prompt = `Generate an image with aspect ratio ${input.aspectRatio}. ${input.prompt}`;
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: prompt },
  ];
  if (input.sourceImage) {
    content.push({
      type: 'image',
      mime_type: input.sourceImage.mimeType,
      data: input.sourceImage.buffer.toString('base64'),
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
        model: env.GEMINI_IMAGE_MODEL,
        input: content,
      }),
      signal: AbortSignal.timeout(env.GENERATION_TIMEOUT_MS),
    });
  } catch {
    throw new ExternalServiceError('Gemini image generation request failed');
  }

  if (!response.ok) {
    throw new ExternalServiceError(
      `Gemini image generation failed with status ${response.status}`,
    );
  }

  let result: GeminiResponse;
  try {
    result = (await response.json()) as GeminiResponse;
  } catch {
    throw new ExternalServiceError('Gemini returned an invalid response');
  }

  const imagePart = [
    ...(result.outputs ?? []),
    ...(result.candidates?.flatMap(
      (candidate) => candidate.content?.parts ?? [],
    ) ?? []),
    ...(result.steps
      ?.filter((step) => step.type === 'model_output')
      .flatMap((step) => step.content ?? []) ?? []),
    ...(result.output_image ? [result.output_image] : []),
  ]
    .map((part) => {
      const inline = part.inlineData ?? part.inline_data;
      return {
        data: part.data ?? inline?.data,
        type: part.type,
        mimeType:
          part.mimeType ??
          part.mime_type ??
          inline?.mimeType ??
          inline?.mime_type,
      };
    })
    .find(
      (part) =>
        part.data &&
        part.mimeType &&
        (part.type === undefined || part.type === 'image'),
    );

  if (!imagePart?.data || !imagePart.mimeType) {
    if (result.promptFeedback?.blockReason) {
      throw new ValidationError(
        'The prompt was blocked by the image provider safety filters',
      );
    }
    throw new ExternalServiceError(
      'Gemini did not return a generated image for this request',
    );
  }

  const image = Buffer.from(imagePart.data, 'base64');
  if (image.length === 0 || image.length > 10 * 1024 * 1024) {
    throw new ExternalServiceError(
      'Gemini returned an empty or oversized image',
    );
  }

  return { buffer: image, mimeType: imagePart.mimeType };
}
