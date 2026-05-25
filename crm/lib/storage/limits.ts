/**
 * File upload limits — single source of truth. Enforced server-side at the
 * upload endpoint AND surfaced to the client so the drag-drop zone can
 * reject files locally before the network round trip.
 *
 * Two dimensions:
 *   1. Per-file: mime type whitelist + per-category size cap. A file that
 *      passes the mime check inherits its category's size cap.
 *   2. Per-space: total storage quota by plan tier. Enforced as a
 *      "would-this-fit" check before each upload.
 *
 * No DB constraints — both dimensions move with product decisions, and a
 * migration per pricing change is its own problem.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

export type FileCategory = 'image' | 'document' | 'video' | 'audio' | 'other';

export interface MimeRule {
  /** What kind of file this is — drives the size cap and tab grouping. */
  category: FileCategory;
  /** Magic-byte signatures for content-type spoofing checks. First match
   *  wins. Empty array → no magic check (text formats with no signature). */
  magicBytes: Array<{ offset: number; bytes: number[] }>;
  /** Friendly extension, used when the original filename has none. */
  extension: string;
}

/** Whitelist. Any mime not on this list is rejected with 415. */
export const MIME_RULES: Record<string, MimeRule> = {
  // Images
  'image/jpeg': {
    category: 'image',
    magicBytes: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
    extension: 'jpg',
  },
  'image/png': {
    category: 'image',
    magicBytes: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
    extension: 'png',
  },
  'image/webp': {
    category: 'image',
    magicBytes: [{ offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }],
    extension: 'webp',
  },
  'image/gif': {
    category: 'image',
    magicBytes: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }],
    extension: 'gif',
  },
  'image/heic': {
    // HEIC is a container; the brand box is at offset 4 ('ftypheic').
    category: 'image',
    magicBytes: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
    extension: 'heic',
  },

  // Documents
  'application/pdf': {
    category: 'document',
    magicBytes: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
    extension: 'pdf',
  },
  'application/msword': {
    // Legacy .doc (OLE2 compound document).
    category: 'document',
    magicBytes: [{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }],
    extension: 'doc',
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    // .docx — zip container.
    category: 'document',
    magicBytes: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
    extension: 'docx',
  },
  'application/vnd.ms-excel': {
    category: 'document',
    magicBytes: [{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }],
    extension: 'xls',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    category: 'document',
    magicBytes: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
    extension: 'xlsx',
  },

  // Videos
  'video/mp4': {
    category: 'video',
    magicBytes: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }], // ftyp box
    extension: 'mp4',
  },
  'video/quicktime': {
    category: 'video',
    magicBytes: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
    extension: 'mov',
  },
  'video/webm': {
    category: 'video',
    magicBytes: [{ offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }],
    extension: 'webm',
  },

  // Audio
  'audio/mpeg': {
    category: 'audio',
    // MP3 either starts with ID3 tag or a frame header (0xff 0xfb).
    magicBytes: [
      { offset: 0, bytes: [0x49, 0x44, 0x33] },
      { offset: 0, bytes: [0xff, 0xfb] },
    ],
    extension: 'mp3',
  },
  'audio/mp4': {
    category: 'audio',
    magicBytes: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
    extension: 'm4a',
  },
  'audio/wav': {
    category: 'audio',
    magicBytes: [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }], // RIFF
    extension: 'wav',
  },
};

/** Maximum size per category, in bytes. */
export const CATEGORY_MAX_BYTES: Record<FileCategory, number> = {
  image: 10 * MB,
  document: 25 * MB,
  video: 200 * MB,
  audio: 50 * MB,
  other: 5 * MB,
};

export interface PlanQuota {
  /** Total storage cap, in bytes. */
  totalBytes: number;
  /** Friendly label for the UI. */
  label: string;
}

/** Per-plan total storage quotas. Keyed by Plan.id ('free', 'pro',
 *  'premium', 'brokerage'). Unknown plan → free tier. */
export const PLAN_QUOTAS: Record<string, PlanQuota> = {
  free: { totalBytes: 100 * MB, label: '100 MB' },
  pro: { totalBytes: 5 * GB, label: '5 GB' },
  premium: { totalBytes: 50 * GB, label: '50 GB' },
  brokerage: { totalBytes: 500 * GB, label: '500 GB' },
};

export function quotaForPlan(planId: string | null | undefined): PlanQuota {
  return PLAN_QUOTAS[planId ?? 'free'] ?? PLAN_QUOTAS.free;
}

export interface ValidateResult {
  ok: boolean;
  reason?: string;
  category?: FileCategory;
}

/** Pure server-side validator. Caller supplies the file's declared
 *  mime + size + the first 16 bytes of content for the magic check. */
export function validateUpload(args: {
  mimeType: string;
  sizeBytes: number;
  header: Uint8Array;
}): ValidateResult {
  const rule = MIME_RULES[args.mimeType];
  if (!rule) {
    return { ok: false, reason: `Unsupported file type: ${args.mimeType || 'unknown'}` };
  }
  if (args.sizeBytes <= 0) {
    return { ok: false, reason: 'Empty file' };
  }
  const cap = CATEGORY_MAX_BYTES[rule.category];
  if (args.sizeBytes > cap) {
    return {
      ok: false,
      reason: `File exceeds ${Math.floor(cap / MB)} MB ${rule.category} limit`,
    };
  }
  // Magic-byte check — only when we have a rule with signatures. Skip for
  // text-y formats with no reliable magic.
  if (rule.magicBytes.length > 0) {
    const matched = rule.magicBytes.some((sig) => {
      if (args.header.length < sig.offset + sig.bytes.length) return false;
      return sig.bytes.every((b, i) => args.header[sig.offset + i] === b);
    });
    if (!matched) {
      return { ok: false, reason: 'File content does not match declared type' };
    }
  }
  return { ok: true, category: rule.category };
}

/** Pretty-print a byte count (1234 → "1.2 KB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}
