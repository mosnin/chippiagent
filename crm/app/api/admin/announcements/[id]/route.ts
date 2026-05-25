import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { logAdminAction } from '@/lib/admin';
import { checkRateLimit } from '@/lib/rate-limit';

const SEVERITIES = ['info', 'warning', 'critical'] as const;
const SEGMENTS = ['all', 'trial', 'active', 'past_due', 'admin'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

function validatePartial(body: any): { ok: true; data: Record<string, any> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const data: Record<string, any> = {};

  if (body.message !== undefined) {
    const m = String(body.message).trim();
    if (m.length < 1 || m.length > 500) return { ok: false, error: 'message must be 1-500 chars' };
    data.message = m;
  }
  if (body.title !== undefined) {
    const t = body.title === null ? null : String(body.title).trim();
    if (t && t.length > 100) return { ok: false, error: 'title must be 0-100 chars' };
    data.title = t || null;
  }
  if (body.severity !== undefined) {
    if (!SEVERITIES.includes(body.severity)) return { ok: false, error: 'Invalid severity' };
    data.severity = body.severity;
  }
  if (body.targetSegment !== undefined) {
    if (!SEGMENTS.includes(body.targetSegment)) return { ok: false, error: 'Invalid targetSegment' };
    data.targetSegment = body.targetSegment;
  }
  if (body.linkUrl !== undefined) {
    const v = body.linkUrl ? String(body.linkUrl).trim() : null;
    if (v && v.length > 500) return { ok: false, error: 'linkUrl too long' };
    data.linkUrl = v;
  }
  if (body.linkLabel !== undefined) {
    const v = body.linkLabel ? String(body.linkLabel).trim() : null;
    if (v && v.length > 100) return { ok: false, error: 'linkLabel too long' };
    data.linkLabel = v;
  }
  if (body.dismissible !== undefined) data.dismissible = Boolean(body.dismissible);
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt).toISOString() : null;
  if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt).toISOString() : null;

  return { ok: true, data };
}

/** PATCH /api/admin/announcements/[id] — update fields */
export async function PATCH(req: Request, { params }: Params) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { allowed } = await checkRateLimit(`admin:${admin.clerkUserId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const v = validatePartial(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const { data, error } = await supabase
    .from('Announcement')
    .update({ ...v.data, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
  }

  await logAdminAction({
    actor: admin.clerkUserId,
    action: 'update_announcement',
    target: id,
    details: v.data,
  });

  return NextResponse.json({ announcement: data });
}

/** DELETE /api/admin/announcements/[id] */
export async function DELETE(_req: Request, { params }: Params) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { allowed } = await checkRateLimit(`admin:${admin.clerkUserId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { error } = await supabase.from('Announcement').delete().eq('id', id);
  if (error) {
    console.error('[admin/announcements] delete failed', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  await logAdminAction({ actor: admin.clerkUserId, action: 'delete_announcement', target: id });
  return NextResponse.json({ message: 'Deleted' });
}
