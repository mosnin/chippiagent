/**
 * Wasabi S3 client. Wasabi is fully S3-compatible — same SDK, same API,
 * different `endpoint`. The only thing that materially changes vs raw AWS
 * S3 is the URL.
 *
 * Required env (all server-side; never expose to the client):
 *   WASABI_ACCESS_KEY_ID
 *   WASABI_SECRET_ACCESS_KEY
 *   WASABI_BUCKET                  — one bucket; everything else is a prefix.
 *   WASABI_ENDPOINT                — e.g. https://s3.us-east-1.wasabisys.com
 *   WASABI_REGION                  — e.g. us-east-1
 *   WASABI_PUBLIC_BASE_URL         — optional. If set, public URLs are built
 *                                    from this base (CDN / custom domain).
 *                                    Defaults to {endpoint}/{bucket}/{key}.
 *
 * The client is lazy — instantiated on first use so a missing env var
 * doesn't crash module load on every cold start. Each environment can opt
 * in independently (dev can keep using Supabase by omitting the keys).
 */

import { S3Client } from '@aws-sdk/client-s3';

export class WasabiNotConfiguredError extends Error {
  constructor() {
    super(
      'Wasabi storage is not configured. Set WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, WASABI_BUCKET, WASABI_ENDPOINT, and WASABI_REGION.',
    );
    this.name = 'WasabiNotConfiguredError';
  }
}

let cachedClient: S3Client | null = null;

export function getWasabiClient(): S3Client {
  if (cachedClient) return cachedClient;
  const accessKeyId = process.env.WASABI_ACCESS_KEY_ID;
  const secretAccessKey = process.env.WASABI_SECRET_ACCESS_KEY;
  const endpoint = process.env.WASABI_ENDPOINT;
  const region = process.env.WASABI_REGION;
  if (!accessKeyId || !secretAccessKey || !endpoint || !region) {
    throw new WasabiNotConfiguredError();
  }
  cachedClient = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // Force path-style addressing — Wasabi supports both but path-style
    // sidesteps DNS lookup quirks and works with custom endpoints.
    forcePathStyle: true,
  });
  return cachedClient;
}

export function getWasabiBucket(): string {
  const bucket = process.env.WASABI_BUCKET;
  if (!bucket) throw new WasabiNotConfiguredError();
  return bucket;
}

/** True when the env is wired. Call sites can branch on this to fall
 *  back to a legacy provider during the cutover window. */
export function isWasabiConfigured(): boolean {
  return Boolean(
    process.env.WASABI_ACCESS_KEY_ID &&
      process.env.WASABI_SECRET_ACCESS_KEY &&
      process.env.WASABI_BUCKET &&
      process.env.WASABI_ENDPOINT &&
      process.env.WASABI_REGION,
  );
}
