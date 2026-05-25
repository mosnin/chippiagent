/**
 * Storage adapter — the only module that talks to a storage provider. Every
 * upload route in this app goes through these four functions. Wasabi
 * (S3-compatible) is the live provider; the surface is shaped so we could
 * swap to raw S3 / R2 / Backblaze without touching call sites.
 *
 * Bucket strategy: ONE Wasabi bucket, prefixes per feature. Operationally
 * simpler than five buckets (one set of credentials, one CORS config, one
 * lifecycle policy) without losing logical isolation.
 *
 * Object keys are prefixed by domain:
 *   chat-attachments/{spaceId}/{uuid}-{filename}
 *   deal-documents/{spaceId}/{dealId}/{uuid}-{filename}
 *   contact-documents/{spaceId}/{contactId}/{uuid}-{filename}
 *   files/{spaceId}/{uuid}-{filename}          — generic file uploader
 *   property-photos/{spaceId}/{propertyId}/{uuid}-{filename}
 *   onboarding/{userId}/{uuid}-{filename}
 *   studio/{spaceId}/{uuid}-{filename}          — Studio-generated media
 *
 * Public vs signed: feature attachments stay PRIVATE — we serve them via
 * `getSignedUrl()` with a short TTL. Property photos and avatars can be
 * PUBLIC (the realtor wants them on a public-facing intake form anyway);
 * those use `getPublicUrl()`.
 */

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getWasabiClient, getWasabiBucket } from './client';

/** Default signed URL lifetime (seconds). 1 hour — enough for the realtor
 *  to actually download a doc; short enough that a leaked URL is bounded. */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface UploadObjectInput {
  /** Object key including the prefix, e.g. "deal-documents/space123/doc-uuid.pdf". */
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  /** When true the object is uploaded with public-read ACL. Default false. */
  isPublic?: boolean;
  /** Optional content-disposition (e.g. attachment; filename="..."). */
  contentDisposition?: string;
  /** Arbitrary user-defined metadata stored alongside the object. */
  metadata?: Record<string, string>;
}

export interface UploadObjectResult {
  key: string;
  publicUrl?: string;
}

/**
 * Upload an object to Wasabi. Caller picks the key (no name mangling here);
 * convention is `{prefix}/{spaceId}/{uuid}-{filename}`.
 */
export async function uploadObject(input: UploadObjectInput): Promise<UploadObjectResult> {
  const client = getWasabiClient();
  const bucket = getWasabiBucket();
  const cmd: PutObjectCommandInput = {
    Bucket: bucket,
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
    ContentDisposition: input.contentDisposition,
    Metadata: input.metadata,
    // Wasabi honors S3 ACLs. We avoid making things public unless explicitly
    // asked — most uploads should be signed-URL access only.
    ACL: input.isPublic ? 'public-read' : undefined,
  };
  await client.send(new PutObjectCommand(cmd));
  return {
    key: input.key,
    publicUrl: input.isPublic ? getPublicUrl(input.key) : undefined,
  };
}

/**
 * Build the public URL for an object. Honors WASABI_PUBLIC_BASE_URL when
 * set (CDN / custom domain), otherwise constructs from endpoint + bucket.
 *
 * Note: only meaningful if the object was uploaded with `isPublic: true`.
 * Private objects will return 403 if accessed without a signed URL.
 */
export function getPublicUrl(key: string): string {
  const customBase = process.env.WASABI_PUBLIC_BASE_URL;
  if (customBase) {
    const trimmed = customBase.replace(/\/$/, '');
    return `${trimmed}/${encodeKey(key)}`;
  }
  const endpoint = process.env.WASABI_ENDPOINT ?? '';
  const bucket = getWasabiBucket();
  const trimmedEndpoint = endpoint.replace(/\/$/, '');
  return `${trimmedEndpoint}/${bucket}/${encodeKey(key)}`;
}

/**
 * Generate a presigned URL for a private object. Default TTL 1 hour.
 * Use for downloading deal documents, chat attachments, etc.
 */
export async function getSignedDownloadUrl(
  key: string,
  ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const client = getWasabiClient();
  const bucket = getWasabiBucket();
  return awsGetSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: ttlSeconds },
  );
}

/**
 * Fetch an object's full contents as a UTF-8 string. For small text objects
 * we own — editor-authored documents — where the caller needs the body
 * inline rather than a download URL.
 */
export async function getObjectText(key: string): Promise<string> {
  const client = getWasabiClient();
  const bucket = getWasabiBucket();
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!res.Body) return '';
  return res.Body.transformToString('utf-8');
}

/**
 * Server-side copy an object to a new key. The source bytes never round
 * trip through our infrastructure — Wasabi handles it internally. Use to
 * promote a private file to a public prefix (e.g. files/ → property-photos/)
 * without re-uploading.
 */
export async function copyObject(args: {
  sourceKey: string;
  destinationKey: string;
  isPublic?: boolean;
  contentType?: string;
}): Promise<void> {
  const client = getWasabiClient();
  const bucket = getWasabiBucket();
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      // CopySource is bucket + key, URL-encoded.
      CopySource: `/${bucket}/${args.sourceKey.split('/').map(encodeURIComponent).join('/')}`,
      Key: args.destinationKey,
      ACL: args.isPublic ? 'public-read' : undefined,
      ContentType: args.contentType,
      MetadataDirective: args.contentType ? 'REPLACE' : 'COPY',
    }),
  );
}

/** Delete an object. Idempotent — S3 doesn't error on missing keys. */
export async function deleteObject(key: string): Promise<void> {
  const client = getWasabiClient();
  const bucket = getWasabiBucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Encode each path segment without touching slashes (S3 treats them as
 *  hierarchy separators in the URL). */
function encodeKey(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

// ─── Prefix helpers — single source of truth for object key shapes ──────────

export const STORAGE_PREFIXES = {
  chatAttachments: 'chat-attachments',
  dealDocuments: 'deal-documents',
  contactDocuments: 'contact-documents',
  files: 'files',
  propertyPhotos: 'property-photos',
  onboarding: 'onboarding',
  studio: 'studio',
} as const;

/** Convenient key builder. Pass the prefix + the suffix segments and get a
 *  normalized key with `/` separators and no leading/trailing slashes. */
export function buildKey(
  prefix: keyof typeof STORAGE_PREFIXES,
  ...segments: string[]
): string {
  const parts = [STORAGE_PREFIXES[prefix], ...segments].filter(
    (s) => s != null && s !== '',
  );
  return parts.join('/');
}
