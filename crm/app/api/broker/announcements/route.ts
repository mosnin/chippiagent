import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, canManageLeads, getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getSpaceByOwnerId } from '@/lib/space';
import { z } from 'zod';

const ANN_PREFIX = '[ANN] ';

const announcementSchema = z.object({
  title: z.string().min(1, 'Title required').max(200),
  body: z.string().min(1, 'Body required').max(10000),
});

/**
 * GET /api/broker/announcements — list all announcements (newest first)
 */
export async function GET() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const space = await getSpaceByOwnerId(ctx.brokerage.ownerId);
    if (!space) {
      return NextResponse.json({ error: 'Broker space not found' }, { status: 500 });
    }

    const { data: notes, error } = await supabase
      .from('Note')
      .select('id, title, content, createdAt, updatedAt')
      .eq('spaceId', space.id)
      .like('title', `${ANN_PREFIX}%`)
      .order('createdAt', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Get the author name from the broker user
    const { data: brokerUser } = await supabase
      .from('User')
      .select('name, email')
      .eq('id', ctx.brokerage.ownerId)
      .maybeSingle();

    const announcements = (notes ?? []).map((n) => {
      // Parse the content to extract author info if stored
      let parsedContent: { body: string; authorName: string; authorId: string } | null = null;
      try {
        parsedContent = JSON.parse(n.content);
      } catch {
        // Legacy plain text
      }

      return {
        id: n.id,
        title: n.title.replace(ANN_PREFIX, ''),
        body: parsedContent?.body ?? n.content,
        authorName: parsedContent?.authorName ?? brokerUser?.name ?? brokerUser?.email ?? 'Broker',
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      };
    });

    return NextResponse.json(announcements);
  } catch (error) {
    console.error('[announcements] GET error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * POST /api/broker/announcements — create a new announcement (admin only)
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canManageLeads(ctx.membership.role)) {
    return NextResponse.json({ error: 'Only admins can post announcements' }, { status: 403 });
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = announcementSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const space = await getSpaceByOwnerId(ctx.brokerage.ownerId);
    if (!space) {
      return NextResponse.json({ error: 'Broker space not found' }, { status: 500 });
    }

    // Get author name
    const { data: authorUser } = await supabase
      .from('User')
      .select('name, email')
      .eq('id', ctx.dbUserId)
      .maybeSingle();
    const authorName = authorUser?.name ?? authorUser?.email ?? 'Broker';

    const contentJson = JSON.stringify({
      body: parsed.data.body,
      authorName,
      authorId: ctx.dbUserId,
    });

    const { data: note, error } = await supabase
      .from('Note')
      .insert({
        spaceId: space.id,
        title: `${ANN_PREFIX}${parsed.data.title}`,
        content: contentJson,
        sortOrder: -2,
      })
      .select('id, title, content, createdAt, updatedAt')
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        id: note.id,
        title: parsed.data.title,
        body: parsed.data.body,
        authorName,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[announcements] POST error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/broker/announcements?id=xxx — delete an announcement (admin only)
 */
export async function DELETE(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canManageLeads(ctx.membership.role)) {
    return NextResponse.json({ error: 'Only admins can delete announcements' }, { status: 403 });
  }

  const noteId = req.nextUrl.searchParams.get('id');
  if (!noteId) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const space = await getSpaceByOwnerId(ctx.brokerage.ownerId);
    if (!space) {
      return NextResponse.json({ error: 'Broker space not found' }, { status: 500 });
    }

    const { error } = await supabase
      .from('Note')
      .delete()
      .eq('id', noteId)
      .eq('spaceId', space.id)
      .like('title', `${ANN_PREFIX}%`);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[announcements] DELETE error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
