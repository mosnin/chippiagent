/**
 * `attach_file_to_property` — promote an uploaded image to a property's
 * photo gallery.
 *
 * Mutating but low-risk: writes to Property.photos[] (push, no replace)
 * and copies the storage object to the public property-photos/ prefix so
 * it can be embedded in `<img>` tags on public intake pages, MMS, etc.
 * Original private File row stays where it is — the realtor can use the
 * same source file across multiple properties without re-uploading.
 *
 * Approval: NOT required. The realtor uploaded the file deliberately; the
 * attach is the obvious next step.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';
import { copyObject, getPublicUrl, buildKey } from '@/lib/storage';

const parameters = z
  .object({
    fileId: z.string().min(1).describe('The File.id of the image to attach.'),
    propertyId: z.string().min(1).describe('The Property.id to attach it to.'),
  })
  .describe('Add an uploaded image to a property\'s photo gallery.');

interface AttachResult {
  propertyId: string;
  photoUrl: string;
  totalPhotos: number;
}

export const attachFileToPropertyTool = defineTool<typeof parameters, AttachResult>({
  name: 'attach_file_to_property',
  riskLevel: 'safe',
  description:
    'Attach an uploaded image to a property\'s photo gallery. Use the file id from list_files. The image becomes embeddable on intake pages, listings, MMS, and emails.',
  parameters,
  requiresApproval: false,
  summariseCall(args) {
    return `Attach file ${args.fileId.slice(0, 8)} to property ${args.propertyId.slice(0, 8)}`;
  },

  async handler(args, ctx) {
    // Both rows must belong to this space — defensive against id-guessing.
    const [fileRes, propRes] = await Promise.all([
      supabase
        .from('File')
        .select('id, name, mimeType, category, storageKey')
        .eq('id', args.fileId)
        .eq('spaceId', ctx.space.id)
        .maybeSingle(),
      supabase
        .from('Property')
        .select('id, address, photos')
        .eq('id', args.propertyId)
        .eq('spaceId', ctx.space.id)
        .maybeSingle(),
    ]);

    if (fileRes.error) {
      return { summary: `File lookup failed: ${fileRes.error.message}`, display: 'error' };
    }
    if (!fileRes.data) {
      return { summary: `No file with id "${args.fileId}".`, display: 'error' };
    }
    const file = fileRes.data as {
      id: string;
      name: string;
      mimeType: string;
      category: string;
      storageKey: string;
    };

    if (file.category !== 'image') {
      return {
        summary: `Only image files can be attached as property photos. "${file.name}" is a ${file.category}.`,
        display: 'error',
      };
    }

    if (propRes.error) {
      return { summary: `Property lookup failed: ${propRes.error.message}`, display: 'error' };
    }
    if (!propRes.data) {
      return { summary: `No property with id "${args.propertyId}".`, display: 'error' };
    }
    const property = propRes.data as {
      id: string;
      address: string;
      photos: string[] | null;
    };

    // Copy to the public property-photos/ prefix. The original private
    // file in files/ stays put so the realtor can re-use it.
    const destKey = buildKey(
      'propertyPhotos',
      ctx.space.id,
      args.propertyId,
      // Filename portion of the original key.
      file.storageKey.split('/').pop() ?? `${args.fileId}-${file.name}`,
    );

    try {
      await copyObject({
        sourceKey: file.storageKey,
        destinationKey: destKey,
        contentType: file.mimeType,
        isPublic: true,
      });
    } catch (err) {
      return {
        summary: `Storage copy failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        display: 'error',
      };
    }

    const photoUrl = getPublicUrl(destKey);
    const nextPhotos = [...(property.photos ?? []), photoUrl];

    const { error: updateErr } = await supabase
      .from('Property')
      .update({ photos: nextPhotos })
      .eq('id', args.propertyId)
      .eq('spaceId', ctx.space.id);

    if (updateErr) {
      return {
        summary: `Property update failed: ${updateErr.message}`,
        display: 'error',
      };
    }

    return {
      summary: `Added "${file.name}" to ${property.address} (${nextPhotos.length} photo${nextPhotos.length === 1 ? '' : 's'}).`,
      data: {
        propertyId: args.propertyId,
        photoUrl,
        totalPhotos: nextPhotos.length,
      },
      display: 'success',
    };
  },
});
