import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';
import { uploadObject, getPublicUrl, buildKey } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * Upload endpoint for onboarding — works before a Space exists.
 * Files are stored under the Clerk user ID in the "branding" bucket.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed } = await checkRateLimit(`upload:${userId}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'logo' | 'photo' | 'broker_logo'

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!['logo', 'photo', 'broker_logo'].includes(type)) {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 });
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only PNG, JPEG, and WebP images are allowed' }, { status: 400 });
    }

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
    const key = buildKey('onboarding', userId, `${type}-${crypto.randomUUID().slice(0, 8)}.${ext}`);

    try {
      await uploadObject({
        key,
        body: buffer,
        contentType: file.type,
        isPublic: true,
      });
    } catch (uploadError) {
      console.error('[upload/onboarding] storage error:', uploadError);
      return NextResponse.json(
        { error: uploadError instanceof Error ? uploadError.message : 'Upload failed' },
        { status: 500 },
      );
    }
    return NextResponse.json({ url: getPublicUrl(key) });
  } catch (err) {
    console.error('[upload/onboarding] error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
