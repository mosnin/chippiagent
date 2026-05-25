import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getSpaceByOwnerId } from '@/lib/space';
import { z } from 'zod';

const CHAT_CONV_PREFIX = '[BROKERAGE_CHAT]';

const messageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(5000),
});

/**
 * Helper: find or create the team chat conversation for this brokerage.
 */
async function getOrCreateChatConversation(spaceId: string, brokerageId: string) {
  const title = `${CHAT_CONV_PREFIX} ${brokerageId}`;

  const { data: existing } = await supabase
    .from('Conversation')
    .select('id')
    .eq('spaceId', spaceId)
    .eq('title', title)
    .maybeSingle();

  if (existing) return existing.id;

  const convId = crypto.randomUUID();
  const { error } = await supabase
    .from('Conversation')
    .insert({
      id: convId,
      spaceId,
      title,
    });

  if (error) throw error;
  return convId;
}

/**
 * GET /api/broker/chat — get messages for the team chat
 */
export async function GET(req: NextRequest) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10),
    200,
  );
  const before = req.nextUrl.searchParams.get('before'); // cursor for pagination

  try {
    const space = await getSpaceByOwnerId(ctx.brokerage.ownerId);
    if (!space) {
      return NextResponse.json({ error: 'Broker space not found' }, { status: 500 });
    }

    const conversationId = await getOrCreateChatConversation(space.id, ctx.brokerage.id);

    let query = supabase
      .from('Message')
      .select('id, role, content, createdAt')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('createdAt', before);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Parse role field to extract sender info
    const messages = (data ?? []).reverse().map((m) => {
      let senderName = 'Unknown';
      let senderId = '';

      // role is stored as "user:userId:Name" for chat messages
      if (m.role.startsWith('user:')) {
        const parts = m.role.split(':');
        senderId = parts[1] ?? '';
        senderName = parts.slice(2).join(':') || 'Unknown';
      }

      return {
        id: m.id,
        content: m.content,
        senderName,
        senderId,
        createdAt: m.createdAt,
      };
    });

    return NextResponse.json({ conversationId, messages });
  } catch (error) {
    console.error('[chat] GET error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * POST /api/broker/chat — send a message to team chat
 */
export async function POST(req: NextRequest) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = messageSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const space = await getSpaceByOwnerId(ctx.brokerage.ownerId);
    if (!space) {
      return NextResponse.json({ error: 'Broker space not found' }, { status: 500 });
    }

    // Get sender's name
    const { data: senderUser } = await supabase
      .from('User')
      .select('name, email')
      .eq('id', ctx.dbUserId)
      .maybeSingle();
    const senderName = senderUser?.name ?? senderUser?.email ?? 'Unknown';

    const conversationId = await getOrCreateChatConversation(space.id, ctx.brokerage.id);
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Store sender info in the role field as "user:userId:Name"
    const role = `user:${ctx.dbUserId}:${senderName}`;

    const { error } = await supabase
      .from('Message')
      .insert({
        id: messageId,
        spaceId: space.id,
        conversationId,
        role,
        content: parsed.data.content.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        createdAt: now,
      });

    if (error) throw error;

    // Update conversation updatedAt
    await supabase
      .from('Conversation')
      .update({ updatedAt: now })
      .eq('id', conversationId);

    return NextResponse.json(
      {
        id: messageId,
        content: parsed.data.content,
        senderName,
        senderId: ctx.dbUserId,
        createdAt: now,
        conversationId,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[chat] POST error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
