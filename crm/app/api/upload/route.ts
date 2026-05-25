import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';
import { uploadObject, getPublicUrl, buildKey } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`upload:${userId}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'logo' | 'photo' | 'favicon' | 'link-thumb'

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!['logo', 'photo', 'favicon', 'link-thumb'].includes(type)) {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only PNG, JPEG, and WebP images are allowed' }, { status: 400 });
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 });
    }

    // Validate magic bytes to prevent disguised file uploads
    const buffer = Buffer.from(await file.arrayBuffer());
    const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47];
    const JPEG_MAGIC = [0xFF, 0xD8, 0xFF];
    const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50]; // bytes 8-11

    let detectedExt: string | null = null;
    if (buffer.length >= 4 && PNG_MAGIC.every((b, i) => buffer[i] === b)) {
      detectedExt = 'png';
    } else if (buffer.length >= 3 && JPEG_MAGIC.every((b, i) => buffer[i] === b)) {
      detectedExt = 'jpg';
    } else if (buffer.length >= 12 && WEBP_MAGIC.every((b, i) => buffer[i + 8] === b)) {
      detectedExt = 'webp';
    }

    if (!detectedExt) {
      return NextResponse.json({ error: 'File content does not match a valid image format (PNG, JPEG, WebP)' }, { status: 400 });
    }

    const ext = detectedExt;
    // Branding assets (logo / photo / favicon) live under the onboarding
    // prefix — same key space as space-level profile uploads. Public-read
    // because they're embedded on /apply public pages.
    const key = buildKey(
      'onboarding',
      space.id,
      `${type}-${crypto.randomUUID().slice(0, 8)}.${ext}`,
    );

    try {
      await uploadObject({
        key,
        body: buffer,
        contentType: file.type,
        isPublic: true,
      });
    } catch (uploadError) {
      console.error('[upload] storage error:', uploadError);
      return NextResponse.json(
        { error: uploadError instanceof Error ? uploadError.message : 'Upload failed' },
        { status: 500 },
      );
    }
    const publicUrl = getPublicUrl(key);

    // Auto-save to SpaceSetting based on type
    const fieldMap: Record<string, string> = {
      logo: 'logoUrl',
      photo: 'realtorPhotoUrl',
      favicon: 'intakeFaviconUrl',
    };
    const field = fieldMap[type];
    if (field) {
      await supabase
        .from('SpaceSetting')
        .upsert({ spaceId: space.id, [field]: publicUrl }, { onConflict: 'spaceId' });
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error('[upload] error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
