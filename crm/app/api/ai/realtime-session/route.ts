import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSpaceForUser, getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * POST /api/ai/realtime-session
 * Mints an ephemeral OpenAI Realtime token and returns it with workspace context
 * for the session instructions. The browser uses this token to connect
 * directly to OpenAI's Realtime API via WebRTC.
 */
export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`realtime:session:${userId}`, 2, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { slug } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  // Verify that the requested slug belongs to the authenticated user's own space.
  // Without this check any authenticated user could obtain a full-context session
  // for another user's workspace by supplying their slug.
  const [space, userSpace] = await Promise.all([
    getSpaceFromSlug(slug),
    getSpaceForUser(userId),
  ]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!userSpace || userSpace.id !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Build workspace context for the voice session
  const [{ data: contacts }, { data: deals }, { data: notes }, { data: tours }, calResult] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, name, type, leadType, email, phone, budget, leadScore, scoreLabel, notes, tags, followUpAt')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false })
      .limit(50),
    supabase
      .from('Deal')
      .select('id, title, value, priority, status, address, DealStage(name)')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false })
      .limit(30),
    supabase
      .from('Note')
      .select('title, content')
      .eq('spaceId', space.id)
      .order('updatedAt', { ascending: false })
      .limit(10),
    supabase
      .from('Tour')
      .select('guestName, propertyAddress, startsAt, status')
      .eq('spaceId', space.id)
      .in('status', ['scheduled', 'confirmed'])
      .gte('startsAt', new Date().toISOString())
      .order('startsAt', { ascending: true })
      .limit(15),
    (async () => {
      try {
        const res = await supabase
          .from('CalendarEvent')
          .select('title, date, time, description')
          .eq('spaceId', space.id)
          .gte('date', new Date().toISOString().slice(0, 10))
          .order('date', { ascending: true })
          .limit(10);
        return res;
      } catch {
        return { data: [] as any[] };
      }
    })(),
  ]);

  const contactCtx = (contacts ?? []).map((c: any) =>
    `- ${c.name} (${(c.leadType ?? 'rental').toUpperCase()}) | ${c.type} | Score: ${c.scoreLabel ?? 'unscored'} | ${c.phone ?? ''} | ${c.email ?? ''} | Budget: ${c.budget != null ? `$${c.budget}` : 'N/A'}${c.followUpAt ? ` | Follow-up: ${new Date(c.followUpAt).toLocaleDateString()}` : ''}`
  ).join('\n');

  const dealCtx = (deals ?? []).map((d: any) =>
    `- ${d.title} | Stage: ${d.DealStage?.name ?? 'N/A'} | Value: ${d.value != null ? `$${d.value}` : 'N/A'} | ${d.address ?? ''}`
  ).join('\n');

  const noteCtx = (notes ?? []).map((n: any) =>
    `- "${n.title}": ${(n.content ?? '').slice(0, 150)}${(n.content ?? '').length > 150 ? '...' : ''}`
  ).join('\n');

  const tourCtx = (tours ?? []).map((t: any) =>
    `- ${t.guestName} | ${t.propertyAddress ?? 'No address'} | ${new Date(t.startsAt).toLocaleDateString()} | ${t.status}`
  ).join('\n');

  const calCtx = ((calResult?.data ?? []) as any[]).map((e: any) =>
    `- ${e.title} | ${e.date}${e.time ? ` at ${e.time}` : ''}`
  ).join('\n');

  const followUpCtx = (contacts ?? []).filter((c: any) => c.followUpAt).slice(0, 10).map((c: any) =>
    `- ${c.name} | Due: ${new Date(c.followUpAt).toLocaleDateString()} | ${c.phone ?? c.email ?? ''}`
  ).join('\n');

  const instructions = [
    `You are Chippi, the realtor's agentic workspace assistant for "${space.name}".`,
    `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`,
    `You help the agent manage their rental and buyer leads, deals, tours, notes, calendar, and follow-ups through natural conversation.`,
    `Buyer stages: Lead → Pre-Approved → Showings → Offer → Under Contract → Closing. Rental stages: Qualification → Tour → Application.`,
    `Be concise and conversational — you're speaking, not writing. Keep responses under 3 sentences unless asked for detail.`,
    `Only reference data from the workspace context below. Never fabricate names, numbers, or details.`,
    `When asked about "recent" data, reference contacts and deals with the most recent createdAt dates.`,
    ``,
    contactCtx ? `Contacts:\n${contactCtx}` : 'No contacts yet.',
    ``,
    dealCtx ? `Deals:\n${dealCtx}` : 'No deals yet.',
    ``,
    tourCtx ? `Upcoming Tours:\n${tourCtx}` : '',
    followUpCtx ? `\nFollow-ups Due:\n${followUpCtx}` : '',
    noteCtx ? `\nNotes:\n${noteCtx}` : '',
    calCtx ? `\nCalendar Events:\n${calCtx}` : '',
  ].filter(Boolean).join('\n');

  // Mint ephemeral token from OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });

  try {
    const tokenRes = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'coral',
        instructions,
        modalities: ['audio', 'text'],
        turn_detection: { type: 'server_vad' },
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[realtime-session] OpenAI token error:', err);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    const data = await tokenRes.json();
    const token = data.client_secret?.value;
    if (!token) {
      console.error('[realtime-session] OpenAI returned no client_secret.value:', JSON.stringify(data));
      return NextResponse.json({ error: 'Session token missing in OpenAI response' }, { status: 500 });
    }
    return NextResponse.json({
      token,
      expiresAt: data.client_secret?.expires_at ?? null,
    });
  } catch (err) {
    console.error('[realtime-session] error:', err);
    return NextResponse.json({ error: 'Session creation failed' }, { status: 500 });
  }
}
