/**
 * Studio generation — the shared core used by both the realtor-facing route
 * (`/api/studio/generate`) and the internal route the Chippi agent calls
 * (`/api/internal/studio/generate`). Keeps generation, storage, and cost
 * metering in one place — no second code path to drift.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  uploadObject,
  deleteObject,
  buildKey,
  getSignedDownloadUrl,
} from '@/lib/storage';
import { generateImage, generateVideo, type GeneratedAsset } from '@/lib/studio/fal';
import { STUDIO_MODELS, DEFAULT_IMAGE_MODEL } from '@/lib/studio/models';

const MAX_PROMPT = 2000;

export interface StudioGenerationResult {
  generationId: string;
  fileId: string;
  url: string;
  kind: 'image' | 'video';
  model: string;
  costUsd: number;
}

/** Thrown on a generation failure; `status` is the HTTP status a route maps to. */
export class StudioGenerationError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'StudioGenerationError';
    this.status = status;
  }
}

/**
 * Run a Studio generation end to end: fold in the brand palette, call fal,
 * copy the result into Wasabi as a File, and log a StudioGeneration row with
 * its dollar cost (summed into usage by lib/usage/queries.ts). Throws
 * StudioGenerationError on failure.
 */
export async function runStudioGeneration(args: {
  spaceId: string;
  userId: string;
  prompt: string;
  modelSlug?: string;
}): Promise<StudioGenerationResult> {
  const prompt = (args.prompt ?? '').trim();
  if (!prompt) throw new StudioGenerationError('A prompt is required.', 400);
  if (prompt.length > MAX_PROMPT) {
    throw new StudioGenerationError('That prompt is too long.', 400);
  }

  const modelSlug =
    args.modelSlug && args.modelSlug in STUDIO_MODELS
      ? args.modelSlug
      : DEFAULT_IMAGE_MODEL;
  const model = STUDIO_MODELS[modelSlug];

  // Brand kit — fold the realtor's palette into the prompt so output comes
  // out on-brand. The original prompt is what gets logged; fal sees the augment.
  let effectivePrompt = prompt;
  const { data: brand } = await supabase
    .from('StudioBrand')
    .select('colors')
    .eq('spaceId', args.spaceId)
    .maybeSingle();
  const brandColors = (brand?.colors as string[] | null) ?? [];
  if (brandColors.length > 0) {
    effectivePrompt = `${prompt}\n\nUse a color palette of ${brandColors.join(', ')}.`;
  }

  const generationId = crypto.randomUUID();
  const { error: genErr } = await supabase.from('StudioGeneration').insert({
    id: generationId,
    spaceId: args.spaceId,
    userId: args.userId,
    kind: model.kind,
    model: model.id,
    prompt,
    status: 'running',
    costUsd: 0,
  });
  if (genErr) {
    logger.error('[studio.generate] log insert failed', { spaceId: args.spaceId }, genErr);
    throw new StudioGenerationError('Could not start generation.', 500);
  }

  const markFailed = async (message: string): Promise<void> => {
    await supabase
      .from('StudioGeneration')
      .update({
        status: 'failed',
        errorMessage: message,
        completedAt: new Date().toISOString(),
      })
      .eq('id', generationId);
  };

  // ── Generate ────────────────────────────────────────────────────────────
  let asset: GeneratedAsset;
  try {
    asset =
      model.kind === 'video'
        ? await generateVideo({ modelId: model.id, prompt: effectivePrompt })
        : await generateImage({ modelId: model.id, prompt: effectivePrompt });
  } catch (err) {
    logger.error(
      '[studio.generate] fal failed',
      { spaceId: args.spaceId, model: model.id },
      err as Error,
    );
    await markFailed('Generation failed');
    throw new StudioGenerationError('Generation failed. Please try again.', 502);
  }

  // ── Copy the bytes out of fal's temporary URL into our own storage ──────
  let buffer: Buffer;
  let contentType = asset.contentType;
  try {
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error(`asset fetch ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    contentType = res.headers.get('content-type') ?? contentType;
  } catch (err) {
    logger.error('[studio.generate] asset fetch failed', { spaceId: args.spaceId }, err as Error);
    await markFailed('Could not retrieve the generated asset.');
    throw new StudioGenerationError('Generation failed. Please try again.', 502);
  }

  // ── Store as a File ─────────────────────────────────────────────────────
  const fileId = crypto.randomUUID();
  const ext =
    model.kind === 'video'
      ? 'mp4'
      : contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : 'jpg';
  const name = `studio-${generationId.slice(0, 8)}.${ext}`;
  const storageKey = buildKey('studio', args.spaceId, `${fileId}-${name}`);

  try {
    await uploadObject({ key: storageKey, body: buffer, contentType, isPublic: false });
  } catch (err) {
    logger.error('[studio.generate] upload failed', { spaceId: args.spaceId }, err as Error);
    await markFailed('Could not store the generated asset.');
    throw new StudioGenerationError('Generation failed. Please try again.', 500);
  }

  const { error: fileErr } = await supabase.from('File').insert({
    id: fileId,
    spaceId: args.spaceId,
    userId: args.userId,
    storageKey,
    name,
    mimeType: contentType,
    category: model.kind === 'video' ? 'video' : 'image',
    sizeBytes: buffer.length,
    isPublic: false,
  });
  if (fileErr) {
    await deleteObject(storageKey).catch(() => undefined);
    logger.error('[studio.generate] file insert failed', { spaceId: args.spaceId }, fileErr);
    await markFailed('Could not record the generated asset.');
    throw new StudioGenerationError('Generation failed. Please try again.', 500);
  }

  await supabase
    .from('StudioGeneration')
    .update({
      status: 'completed',
      fileId,
      costUsd: model.costUsd,
      completedAt: new Date().toISOString(),
    })
    .eq('id', generationId);

  const url = await getSignedDownloadUrl(storageKey);
  return {
    generationId,
    fileId,
    url,
    kind: model.kind,
    model: model.id,
    costUsd: model.costUsd,
  };
}
