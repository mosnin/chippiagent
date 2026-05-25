/**
 * `list_files` — list files the realtor uploaded to the Files page.
 *
 * Read-only. Searchable by filename substring and filterable by category
 * (image / document / video / audio / other). Returns up to 20 most-recent
 * matching rows; the realtor can refine with a more specific query when
 * there are more matches.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const CATEGORIES = ['image', 'document', 'video', 'audio', 'other'] as const;

const parameters = z
  .object({
    category: z
      .enum(CATEGORIES)
      .optional()
      .describe('Filter by file category. Omit to list all categories.'),
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Case-insensitive substring search against the original filename. Omit to skip the filter.',
      ),
    limit: z.number().int().min(1).max(50).optional().describe('Max rows. Defaults to 20.'),
  })
  .describe('List files in the realtor\'s Files surface, optionally filtered.');

interface FileRow {
  id: string;
  name: string;
  mimeType: string;
  category: string;
  sizeBytes: number;
  createdAt: string;
}

interface ListFilesResult {
  files: FileRow[];
}

export const listFilesTool = defineTool<typeof parameters, ListFilesResult>({
  name: 'list_files',
  riskLevel: 'safe',
  description:
    'List the realtor\'s uploaded files (images, documents, videos, audio). Use to find a file by name before passing it to send_email, attach_file_to_property, or read_file.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    let query = supabase
      .from('File')
      .select('id, name, mimeType, category, sizeBytes, createdAt')
      .eq('spaceId', ctx.space.id)
      .order('createdAt', { ascending: false })
      .limit(args.limit ?? 20);

    if (args.category) query = query.eq('category', args.category);
    if (args.query) query = query.ilike('name', `%${args.query}%`);

    const { data, error } = await query;
    if (error) {
      return { summary: `Files lookup failed: ${error.message}`, display: 'error' };
    }
    const rows = (data ?? []) as FileRow[];
    if (rows.length === 0) {
      const hint = args.query
        ? `No files match "${args.query}"${args.category ? ` in ${args.category}` : ''}.`
        : 'No files uploaded yet.';
      return { summary: hint, data: { files: [] }, display: 'plain' };
    }

    const verb = args.query ? `matching "${args.query}"` : '';
    const cat = args.category ? `${args.category} ` : '';
    return {
      summary: `${rows.length} ${cat}file${rows.length === 1 ? '' : 's'} ${verb}`.trim(),
      data: { files: rows },
      display: 'plain',
    };
  },
});
