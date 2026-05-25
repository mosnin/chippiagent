/**
 * Shared helpers for the public realtor page (/p/[slug]) and its editor.
 *
 * Pure functions only — imported by both the server-rendered page and the
 * client editor, so nothing here may touch the DOM or server-only APIs.
 */

/** Pull the 11-char video id out of any common YouTube URL shape. */
export function parseYouTubeId(url: string): string | null {
  if (typeof url !== 'string') return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

/** Thumbnail for a YouTube video id. hqdefault always exists (unlike maxres). */
export function youTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * A favicon URL for any http(s) link, via Google's favicon service. Used as
 * the fallback icon on a custom link that has no uploaded thumbnail.
 */
export function faviconUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`;
  } catch {
    return null;
  }
}
