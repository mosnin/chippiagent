/**
 * `read_file` — return a short-lived signed download URL + metadata for a
 * File row. Read-only.
 *
 * Companion to `list_files`. The model uses list_files to find a file by
 * name, then calls read_file with the id to surface the URL to the realtor
 * (e.g. "here's the link to your closing disclosure") or to pass to
 * downstream tools like send_email (attachmentFileIds) or
 * attach_file_to_property (fileId).
 *
 * The returned signedUrl is private and expires in 5 minutes. Don't paste
 * it into anything that might persist — the model is told this in the tool
 * description so it doesn't quote the URL back to the realtor as
 * shareable.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { defineTool } from '../types';

const parameters = z
  .object({
    fileId: z.string().min(1).describe('The File.id to look up.'),
  })
  .describe('Return a temporary download URL and metadata for an uploaded file.');

interface ReadFileResult {
  fileId: string;
  name: string;
  mimeType: string;
  category: string;
  sizeBytes: number;
  signedUrl: string;
  /** ISO timestamp when the signedUrl expires. */
  expiresAt: string;
}

export const readFileTool = defineTool<typeof parameters, ReadFileResult>({
  name: 'read_file',
  riskLevel: 'safe',
  description:
    'Return a 5-min signed download URL + metadata for an uploaded file. URL is private — pass to other tools (send_email attachments, attach_file_to_property) or download in this turn; do not quote as shareable.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const { data: row, error } = await supabase
      .from('File')
      .select('id, name, mimeType, category, sizeBytes, storageKey')
      .eq('id', args.fileId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (error) {
      return { summary: `File lookup failed: ${error.message}`, display: 'error' };
    }
    if (!row) {
      return {
        summary: `No file with id "${args.fileId}" in this workspace.`,
        display: 'error',
      };
    }

    const r = row as {
      id: string;
      name: string;
      mimeType: string;
      category: string;
      sizeBytes: number;
      storageKey: string;
    };

    let signedUrl: string;
    try {
      signedUrl = await getSignedDownloadUrl(r.storageKey, 60 * 5);
    } catch (err) {
      return {
        summary: `Could not generate download URL: ${err instanceof Error ? err.message : 'unknown error'}`,
        display: 'error',
      };
    }

    return {
      summary: `${r.name} (${r.mimeType}).`,
      data: {
        fileId: r.id,
        name: r.name,
        mimeType: r.mimeType,
        category: r.category,
        sizeBytes: r.sizeBytes,
        signedUrl,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
      display: 'plain',
    };
  },
});
