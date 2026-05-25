import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const space = await getSpaceFromSlug(slug);
    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

    const { data: owner } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', userId)
      .eq('id', space.ownerId)
      .maybeSingle();
    if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await supabase
      .from('Conversation')
      .select('*')
      .eq('spaceId', space.id)
      .not('title', 'like', '[BROKERAGE_CHAT]%')
      .order('updatedAt', { ascending: false });
    if (error) return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });

    const conversations = data ?? [];

    // Fetch the last message for each conversation to provide a preview line.
    // Single query: grab the most-recent message per conversationId for this
    // set of conversations, then map them back by id.
    const ids = conversations.map((c) => c.id);
    let previewMap: Record<string, string> = {};
    if (ids.length > 0) {
      // PostgREST doesn't support GROUP BY, so we fetch with a high-enough
      // limit and deduplicate in JS. We order descending so the first row we
      // see for each conversationId is the latest one.
      const { data: msgs } = await supabase
        .from('Message')
        .select('conversationId, content')
        .in('conversationId', ids)
        .order('createdAt', { ascending: false })
        .limit(ids.length * 20); // generous cap; deduplication below

      if (msgs) {
        for (const msg of msgs) {
          if (msg.conversationId && !(msg.conversationId in previewMap)) {
            const text = (msg.content ?? '').replace(/\s+/g, ' ').trim();
            previewMap[msg.conversationId] = text.length > 60 ? text.slice(0, 59) + '…' : text;
          }
        }
      }
    }

    const result = conversations.map((c) => ({
      ...c,
      preview: previewMap[c.id] ?? null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('[conversations] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await req.json();
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const space = await getSpaceFromSlug(slug);
    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

    const { data: owner } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', userId)
      .eq('id', space.ownerId)
      .maybeSingle();
    if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('Conversation')
      .insert({
        id: crypto.randomUUID(),
        spaceId: space.id,
        title: 'New conversation',
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('[conversations] POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
