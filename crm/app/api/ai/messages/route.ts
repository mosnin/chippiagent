import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const MESSAGE_LIMIT = 50;

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const conversationId = req.nextUrl.searchParams.get('conversationId');
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    // Two flat queries instead of an embedded join — `Space(ownerId)` can
    // come back either as an object or an array depending on PostgREST's
    // FK inference, and the previous code (`conv.Space.ownerId`) silently
    // produced `undefined` in the array case, killing the auth check
    // with a 403 the client couldn't see.
    const { data: conv, error: convErr } = await supabase
      .from('Conversation')
      .select('id, spaceId')
      .eq('id', conversationId)
      .maybeSingle();
    if (convErr) {
      console.error('[messages] Conversation lookup failed:', convErr);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: dbUser, error: userErr } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', userId)
      .maybeSingle();
    if (userErr) {
      console.error('[messages] User lookup failed:', userErr);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
    if (!dbUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: space, error: spaceErr } = await supabase
      .from('Space')
      .select('id, ownerId')
      .eq('id', conv.spaceId)
      .maybeSingle();
    if (spaceErr) {
      console.error('[messages] Space lookup failed:', spaceErr);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
    if (!space || space.ownerId !== dbUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('Message')
      .select('id, role, content, blocks, createdAt')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: true })
      .limit(MESSAGE_LIMIT);
    if (error) {
      console.error('[messages] Message lookup failed:', error);
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error('[messages] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
