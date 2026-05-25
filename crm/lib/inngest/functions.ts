/**
 * Inngest functions.
 *
 * publishScheduledPost — fires when a scheduled Studio post comes due. The
 * schedule route sends `studio/post.scheduled` with a delayed `ts`, so the
 * event sits in Inngest's queue until the scheduled minute and the function
 * runs then. It publishes the asset to each connected platform via Composio.
 *
 * One Inngest step per platform: on a retry, a platform that already posted
 * is memoized and never posts twice — only a genuinely failed step re-runs.
 */

import { inngest } from './client';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { publishToPlatform } from '@/lib/studio/publish';

interface LoadedPost {
  status: string;
  userId: string;
  caption: string;
  platforms: string[];
  storageKey: string | null;
}

export const publishScheduledPost = inngest.createFunction(
  {
    id: 'studio-publish-scheduled-post',
    triggers: [{ event: 'studio/post.scheduled' }],
  },
  async ({ event, step }) => {
    const postId = String((event.data as { postId?: unknown }).postId ?? '');
    if (!postId) return { skipped: 'no postId' };

    // Load the post and the storage key of its image.
    const post = await step.run('load-post', async (): Promise<LoadedPost | null> => {
      const { data } = await supabase
        .from('StudioPost')
        .select('status, userId, caption, platforms, fileId')
        .eq('id', postId)
        .maybeSingle();
      if (!data) return null;
      const row = data as {
        status: string;
        userId: string;
        caption: string | null;
        platforms: string[] | null;
        fileId: string;
      };
      const { data: file } = await supabase
        .from('File')
        .select('storageKey')
        .eq('id', row.fileId)
        .maybeSingle();
      return {
        status: row.status,
        userId: row.userId,
        caption: row.caption ?? '',
        platforms: row.platforms ?? [],
        storageKey: (file as { storageKey?: string } | null)?.storageKey ?? null,
      };
    });

    // Gone, or no longer scheduled (canceled / already handled) — stop.
    if (!post || post.status !== 'scheduled') {
      return { skipped: 'not scheduled' };
    }

    if (!post.storageKey) {
      await step.run('mark-missing', async () => {
        await supabase
          .from('StudioPost')
          .update({
            status: 'failed',
            platformResults: { error: 'The post image is missing.' },
            updatedAt: new Date().toISOString(),
          })
          .eq('id', postId);
        return { done: true };
      });
      return { failed: 'missing image' };
    }

    // Claim it so a duplicate event can't double-publish.
    await step.run('claim', async () => {
      await supabase
        .from('StudioPost')
        .update({ status: 'publishing', updatedAt: new Date().toISOString() })
        .eq('id', postId);
      return { done: true };
    });

    const imageUrl = await step.run('sign-image', () =>
      getSignedDownloadUrl(post.storageKey as string, 3600),
    );

    const platforms = [...new Set(post.platforms)];
    const results: Record<string, { status: string; error?: string }> = {};
    let anyOk = false;
    for (const toolkit of platforms) {
      const outcome = await step.run(`publish-${toolkit}`, () =>
        publishToPlatform({
          toolkit,
          entityId: post.userId,
          imageUrl,
          caption: post.caption,
        }),
      );
      results[toolkit] = outcome.ok
        ? { status: 'posted' }
        : { status: 'failed', error: outcome.error };
      if (outcome.ok) anyOk = true;
    }

    await step.run('finalize', async () => {
      await supabase
        .from('StudioPost')
        .update({
          status: anyOk ? 'posted' : 'failed',
          platformResults: results,
          postedAt: anyOk ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', postId);
      return { done: true };
    });

    return { postId, posted: anyOk, results };
  },
);
