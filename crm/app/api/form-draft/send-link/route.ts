import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendDraftResumeEmail } from '@/lib/email';

const sendLinkSchema = z.object({
  spaceId: z.string().min(1),
  email: z.string().trim().email().max(255),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = sendLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data' },
      { status: 400 },
    );
  }

  const { spaceId, email } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit: 3 emails per email address per hour
  const { allowed } = await checkRateLimit(`draft:email:${normalizedEmail}`, 3, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many email requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Add a random delay to prevent timing attacks on draft lookup
  const randomDelay = 50 + Math.floor(Math.random() * 100); // 50-150ms
  await new Promise((resolve) => setTimeout(resolve, randomDelay));

  try {
    // Find active draft for this email + space
    const { data: draft, error: draftError } = await supabase
      .from('FormDraft')
      .select('id, resumeToken')
      .eq('spaceId', spaceId)
      .eq('email', normalizedEmail)
      .is('completedAt', null)
      .gt('expiresAt', new Date().toISOString())
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftError) throw draftError;

    if (!draft) {
      // Don't reveal whether a draft exists — return success regardless
      return NextResponse.json({ sent: true });
    }

    // Fetch space slug and business name
    const { data: space } = await supabase
      .from('Space')
      .select('slug, name')
      .eq('id', spaceId)
      .maybeSingle();

    if (!space) {
      return NextResponse.json({ sent: true });
    }

    const { data: settings } = await supabase
      .from('SpaceSetting')
      .select('businessName')
      .eq('spaceId', spaceId)
      .maybeSingle();

    const businessName = settings?.businessName || space.name;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
    const resumeUrl = `${appUrl}/apply/${space.slug}?resume=${draft.resumeToken}`;

    await sendDraftResumeEmail({
      toEmail: normalizedEmail,
      businessName,
      resumeUrl,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error('[form-draft/send-link] Failed to send resume link:', error);
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
