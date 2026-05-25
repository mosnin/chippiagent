/**
 * fal.ai client wrapper — the only module that talks to fal. Every Studio
 * generation goes through here, the same swap-insulation invariant held for
 * Composio (`lib/integrations/composio.ts`) and the OpenAI Agents SDK.
 *
 * The @fal-ai/client SDK reads the FAL_KEY env var automatically on the
 * server — there is no explicit configure step.
 */

import { fal } from '@fal-ai/client';

export interface GeneratedAsset {
  /** fal-hosted URL of the result — temporary, copy the bytes promptly. */
  url: string;
  contentType: string;
}

/** True when FAL_KEY is set. Routes use this to fail cleanly when it isn't. */
export function falConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

/** fal image models return either { images: [...] } or a single { image }. */
function extractImage(data: unknown): GeneratedAsset {
  const d = data as {
    images?: Array<{ url?: string; content_type?: string }>;
    image?: { url?: string; content_type?: string };
  };
  const img = d.images?.[0] ?? d.image;
  if (!img?.url) {
    throw new Error('fal returned no image');
  }
  return { url: img.url, contentType: img.content_type ?? 'image/jpeg' };
}

/** fal video models return { video: { url } }. */
function extractVideo(data: unknown): GeneratedAsset {
  const d = data as { video?: { url?: string; content_type?: string } };
  if (!d.video?.url) {
    throw new Error('fal returned no video');
  }
  return { url: d.video.url, contentType: d.video.content_type ?? 'video/mp4' };
}

/**
 * Generate an image from a text prompt. `fal.subscribe` submits to fal's
 * queue and resolves when the result is ready — image models finish in a few
 * seconds.
 */
export async function generateImage(args: {
  modelId: string;
  prompt: string;
}): Promise<GeneratedAsset> {
  const result = await fal.subscribe(args.modelId, {
    input: { prompt: args.prompt },
  });
  return extractImage(result.data);
}

/**
 * Generate a video from a text prompt. Video models run for a few minutes;
 * `fal.subscribe` holds the request open until fal finishes, so the calling
 * route sets a long maxDuration. A queue + webhook path is the eventual
 * upgrade for scale.
 */
export async function generateVideo(args: {
  modelId: string;
  prompt: string;
}): Promise<GeneratedAsset> {
  const result = await fal.subscribe(args.modelId, {
    input: { prompt: args.prompt },
  });
  return extractVideo(result.data);
}

/**
 * Transform an existing image — upscale, background removal, or an
 * instruction edit. The source is passed to fal as a URL it fetches.
 */
export async function transformImage(args: {
  modelId: string;
  imageUrl: string;
  prompt?: string;
}): Promise<GeneratedAsset> {
  const input: Record<string, unknown> = { image_url: args.imageUrl };
  if (args.prompt) input.prompt = args.prompt;
  const result = await fal.subscribe(args.modelId, { input });
  return extractImage(result.data);
}
