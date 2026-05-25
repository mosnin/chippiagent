/**
 * Studio image editing — the shared core used by the realtor-facing route
 * (/api/studio/edit) and the internal route the Chippi agent calls. It takes
 * a source File that already exists and produces a new edited File.
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
import { transformImage, type GeneratedAsset } from '@/lib/studio/fal';
import { STUDIO_EDIT_TOOLS } from '@/lib/studio/models';
import { StudioGenerationError, type StudioGenerationResult } from '@/lib/studio/generate';

const MAX_PROMPT = 2000;

/**
 * Run a Studio edit: transform an existing File (upscale / remove background
 * / restyle) and store the result as a NEW File — the source is left intact.
 * Logged in StudioGeneration with sourceFileId set and its cost metered.
 * Throws StudioGenerationError on failure.
 */
export async function runStudioEdit(args: {
  spaceId: string;
  userId: string;
  sourceFileId: string;
  toolSlug: string;
  prompt?: string;
}): Promise<StudioGenerationResult> {
  const tool = STUDIO_EDIT_TOOLS[args.toolSlug];
  if (!tool) {
    throw new StudioGenerationError('Unknown edit tool.', 400);
  }
  const prompt = (args.prompt ?? '').trim();
  if (tool.needsPrompt && !prompt) {
    throw new StudioGenerationError('This tool needs an instruction.', 400);
  }
  if (prompt.length > MAX_PROMPT) {
    throw new StudioGenerationError('That instruction is too long.', 400);
  }

  // Load the source File — must exist, belong to the space, BE an image, and
  // fit under fal's input ceiling. Skipping the category check sends fal a
  // PDF or a 4K video and bills the failed call.
  const MAX_EDIT_BYTES = 20 * 1024 * 1024;
  const { data: source } = await supabase
    .from('File')
    .select('storageKey, category, sizeBytes')
    .eq('id', args.sourceFileId)
    .eq('spaceId', args.spaceId)
    .maybeSingle();
  if (!source?.storageKey) {
    throw new StudioGenerationError('The image to edit was not found.', 404);
  }
  if (source.category !== 'image') {
    throw new StudioGenerationError('That file is not an image.', 400);
  }
  if (typeof source.sizeBytes === 'number' && source.sizeBytes > MAX_EDIT_BYTES) {
    throw new StudioGenerationError('That image is too large to edit (max 20 MB).', 400);
  }
  const sourceUrl = await getSignedDownloadUrl(source.storageKey as string, 3600);

  const generationId = crypto.randomUUID();
  const { error: genErr } = await supabase.from('StudioGeneration').insert({
    id: generationId,
    spaceId: args.spaceId,
    userId: args.userId,
    kind: 'image',
    model: tool.id,
    prompt: prompt || null,
    sourceFileId: args.sourceFileId,
    status: 'running',
    costUsd: 0,
  });
  if (genErr) {
    logger.error('[studio.edit] log insert failed', { spaceId: args.spaceId }, genErr);
    throw new StudioGenerationError('Could not start the edit.', 500);
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

  let out: GeneratedAsset;
  try {
    out = await transformImage({
      modelId: tool.id,
      imageUrl: sourceUrl,
      prompt: tool.needsPrompt ? prompt : undefined,
    });
  } catch (err) {
    logger.error('[studio.edit] fal failed', { spaceId: args.spaceId, model: tool.id }, err as Error);
    await markFailed('Edit failed');
    throw new StudioGenerationError('The edit failed. Please try again.', 502);
  }

  let buffer: Buffer;
  let contentType = out.contentType;
  try {
    const res = await fetch(out.url);
    if (!res.ok) throw new Error(`asset fetch ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    contentType = res.headers.get('content-type') ?? contentType;
  } catch (err) {
    logger.error('[studio.edit] result fetch failed', { spaceId: args.spaceId }, err as Error);
    await markFailed('Could not retrieve the edited image.');
    throw new StudioGenerationError('The edit failed. Please try again.', 502);
  }

  const fileId = crypto.randomUUID();
  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
      ? 'webp'
      : 'jpg';
  const name = `studio-${generationId.slice(0, 8)}.${ext}`;
  const storageKey = buildKey('studio', args.spaceId, `${fileId}-${name}`);

  try {
    await uploadObject({ key: storageKey, body: buffer, contentType, isPublic: false });
  } catch (err) {
    logger.error('[studio.edit] upload failed', { spaceId: args.spaceId }, err as Error);
    await markFailed('Could not store the edited image.');
    throw new StudioGenerationError('The edit failed. Please try again.', 500);
  }

  const { error: fileErr } = await supabase.from('File').insert({
    id: fileId,
    spaceId: args.spaceId,
    userId: args.userId,
    storageKey,
    name,
    mimeType: contentType,
    category: 'image',
    sizeBytes: buffer.length,
    isPublic: false,
  });
  if (fileErr) {
    await deleteObject(storageKey).catch(() => undefined);
    logger.error('[studio.edit] file insert failed', { spaceId: args.spaceId }, fileErr);
    await markFailed('Could not record the edited image.');
    throw new StudioGenerationError('The edit failed. Please try again.', 500);
  }

  await supabase
    .from('StudioGeneration')
    .update({
      status: 'completed',
      fileId,
      costUsd: tool.costUsd,
      completedAt: new Date().toISOString(),
    })
    .eq('id', generationId);

  const url = await getSignedDownloadUrl(storageKey);
  return { generationId, fileId, url, kind: 'image', model: tool.id, costUsd: tool.costUsd };
}
