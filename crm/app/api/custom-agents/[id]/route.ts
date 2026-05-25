import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

type Params = { params: Promise<{ id: string }> };

// ── GET /api/custom-agents/[id] ───────────────────────────────────────────────
// Fetch a single custom agent. Verifies the agent belongs to the caller's space.

export async function GET(_req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  const { data: agent, error } = await supabase
    .from('CustomAgent')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[custom-agents/[id]/GET] fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
  if (!agent) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (agent.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ agent });
}

// ── PUT /api/custom-agents/[id] ───────────────────────────────────────────────
// Update a custom agent. Accepts partial updates to any of the mutable fields.
// Applies the same validation rules as POST.

export async function PUT(req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Fetch the agent and verify ownership before mutating.
  const { data: existing, error: fetchError } = await supabase
    .from('CustomAgent')
    .select('id, spaceId')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    console.error('[custom-agents/[id]/PUT] fetch error:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    name?: unknown;
    description?: unknown;
    systemPrompt?: unknown;
    model?: unknown;
    capabilities?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, description, systemPrompt, model, capabilities } = body;

  // Validate fields that are present in the payload.
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
    }
  }
  if (description !== undefined && typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string' }, { status: 400 });
  }
  if (systemPrompt !== undefined) {
    if (typeof systemPrompt !== 'string' || systemPrompt.trim().length === 0) {
      return NextResponse.json({ error: 'systemPrompt must be a non-empty string' }, { status: 400 });
    }
    if (systemPrompt.trim().length > 10000) {
      return NextResponse.json({ error: 'systemPrompt must be 10,000 characters or fewer' }, { status: 400 });
    }
  }
  if (model !== undefined && typeof model !== 'string') {
    return NextResponse.json({ error: 'model must be a string' }, { status: 400 });
  }
  if (capabilities !== undefined && !Array.isArray(capabilities)) {
    return NextResponse.json({ error: 'capabilities must be an array' }, { status: 400 });
  }

  // Build the update object from validated fields.
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description;
  if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt.trim();
  if (model !== undefined) updates.model = model;
  if (capabilities !== undefined) updates.capabilities = capabilities;
  updates.updatedAt = new Date().toISOString();

  const { data: agent, error: updateError } = await supabase
    .from('CustomAgent')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    console.error('[custom-agents/[id]/PUT] update error:', updateError);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }

  return NextResponse.json({ agent });
}

// ── DELETE /api/custom-agents/[id] ───────────────────────────────────────────
// Soft-delete a custom agent by setting isActive=false.

export async function DELETE(_req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Fetch the agent and verify ownership before mutating.
  const { data: existing, error: fetchError } = await supabase
    .from('CustomAgent')
    .select('id, spaceId')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    console.error('[custom-agents/[id]/DELETE] fetch error:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from('CustomAgent')
    .update({ isActive: false, updatedAt: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    console.error('[custom-agents/[id]/DELETE] soft-delete error:', updateError);
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
