/**
 * Studio publishing — post a Studio asset to a connected social platform via
 * Composio. Called by the Studio publish Inngest function in
 * lib/inngest/functions.ts, once per (post, platform).
 *
 * ─── Verification note ──────────────────────────────────────────────────────
 * The per-platform Composio action slugs and argument shapes below are derived
 * from Composio's documented social toolkits. They have NOT been run against
 * the live Composio API. Verify each on the first real publish — a wrong slug
 * or argument fails ONLY that one platform (the error is recorded on the
 * post's platformResults); it never throws out of here, never affects the
 * other platforms, and never affects the cron. Correcting a platform is a
 * localized edit to its function below.
 */

import { executeToolForEntity } from '@/lib/integrations/composio';

export interface PublishOutcome {
  ok: boolean;
  error?: string;
}

interface PublishArgs {
  /** Composio toolkit slug — 'facebook' | 'instagram' | 'linkedin'. */
  toolkit: string;
  /** The realtor's Clerk userId — Composio's entity id. */
  entityId: string;
  /** A signed, fetchable URL to the post image. */
  imageUrl: string;
  caption: string;
}

/** Composio's ToolExecuteResponse is loosely typed — narrow what we read. */
function outcomeOf(res: unknown): PublishOutcome {
  const r = res as { successful?: boolean; error?: string | null };
  if (r.successful === false) {
    return { ok: false, error: r.error || 'The platform rejected the post.' };
  }
  return { ok: true };
}

async function postFacebook(a: PublishArgs): Promise<PublishOutcome> {
  const res = await executeToolForEntity({
    entityId: a.entityId,
    slug: 'FACEBOOK_CREATE_PHOTO_POST',
    arguments: { url: a.imageUrl, caption: a.caption },
  });
  return outcomeOf(res);
}

async function postLinkedIn(a: PublishArgs): Promise<PublishOutcome> {
  const res = await executeToolForEntity({
    entityId: a.entityId,
    slug: 'LINKEDIN_CREATE_LINKED_IN_POST',
    arguments: { commentary: a.caption, image_url: a.imageUrl, visibility: 'PUBLIC' },
  });
  return outcomeOf(res);
}

async function postInstagram(a: PublishArgs): Promise<PublishOutcome> {
  // Instagram publishes in two steps: create a media container, then publish it.
  const container = await executeToolForEntity({
    entityId: a.entityId,
    slug: 'INSTAGRAM_POST_IG_USER_MEDIA',
    arguments: { image_url: a.imageUrl, caption: a.caption },
  });
  const c = container as {
    successful?: boolean;
    error?: string | null;
    data?: { id?: string };
  };
  if (c.successful === false) {
    return { ok: false, error: c.error || 'Instagram rejected the media.' };
  }
  const creationId = c.data?.id;
  if (!creationId) {
    return { ok: false, error: 'Instagram did not return a media container id.' };
  }
  const publish = await executeToolForEntity({
    entityId: a.entityId,
    slug: 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH',
    arguments: { creation_id: creationId },
  });
  return outcomeOf(publish);
}

/**
 * Publish one asset to one platform. Never throws — every failure (including
 * an unsupported platform) comes back as { ok: false, error }.
 */
export async function publishToPlatform(a: PublishArgs): Promise<PublishOutcome> {
  try {
    switch (a.toolkit) {
      case 'facebook':
        return await postFacebook(a);
      case 'instagram':
        return await postInstagram(a);
      case 'linkedin':
        return await postLinkedIn(a);
      default:
        return {
          ok: false,
          error: `Auto-posting isn't supported for ${a.toolkit} yet.`,
        };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Post failed.' };
  }
}
