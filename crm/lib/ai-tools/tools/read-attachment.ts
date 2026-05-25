/**
 * `read_attachment` — return metadata for a chat attachment.
 *
 * Read-only. **Does not stream blob content** through the model. The
 * full Python implementation in `agent/tools/attachments.py` does
 * lazy PDF/DOCX/XLSX extraction on demand; in the TS runtime we extract
 * at upload time (`/api/ai/attachments`) and inject `extractedText`
 * into the user message. This tool is the metadata-only readback path:
 * the realtor sees what was attached, the model sees enough to reference
 * the file by name.
 *
 * Schema: Attachment table from migration 20260430120000_attachments.sql.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    attachmentId: z.string().min(1).describe('The Attachment.id to look up.'),
  })
  .describe('Read metadata for a chat attachment.');

interface ReadAttachmentResult {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  extractionStatus: 'pending' | 'skipped' | 'done' | 'failed';
  hasExtractedText: boolean;
  description: string | null;
}

export const readAttachmentTool = defineTool<typeof parameters, ReadAttachmentResult>({
  name: 'read_attachment',
  riskLevel: 'safe',
  description:
    'Look up an attachment by id and return its filename, mime type, and extraction status. Does not return file contents.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const { data: row, error } = await supabase
      .from('Attachment')
      .select('id, filename, mimeType, sizeBytes, extractionStatus, extractedText')
      .eq('id', args.attachmentId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (error) {
      return { summary: `Attachment lookup failed: ${error.message}`, display: 'error' };
    }
    if (!row) {
      return {
        summary: `No attachment with id "${args.attachmentId}" in this workspace.`,
        display: 'error',
      };
    }

    const r = row as {
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number | null;
      extractionStatus: 'pending' | 'skipped' | 'done' | 'failed' | null;
      extractedText: string | null;
    };
    const status = (r.extractionStatus ?? 'pending') as ReadAttachmentResult['extractionStatus'];
    const hasText = typeof r.extractedText === 'string' && r.extractedText.length > 0;

    // A short, safe description: first line of extracted text if any, capped.
    const description = hasText
      ? (r.extractedText as string).split(/\r?\n/, 1)[0].slice(0, 140) || null
      : null;

    const sizeKb = r.sizeBytes != null ? `${Math.round(r.sizeBytes / 1024)} KB` : 'unknown size';
    const summary = `${r.filename} (${r.mimeType}, ${sizeKb}).`;

    return {
      summary,
      data: {
        attachmentId: r.id,
        filename: r.filename,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes ?? null,
        extractionStatus: status,
        hasExtractedText: hasText,
        description,
      },
      display: 'plain',
    };
  },
});
