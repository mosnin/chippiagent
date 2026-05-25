import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import type { Pipeline } from '@/lib/types';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const DEFAULT_PIPELINES = [
  {
    name: 'Rental Pipeline',
    color: '#6366f1',
    emoji: null,
    pipelineType: 'rental',
    defaultStages: [
      { name: 'New Inquiry', color: '#6b7280', position: 0 },
      { name: 'Screening', color: '#3b82f6', position: 1 },
      { name: 'Showing', color: '#8b5cf6', position: 2 },
      { name: 'Application', color: '#f59e0b', position: 3 },
      { name: 'Approved', color: '#10b981', position: 4 },
    ],
  },
  {
    name: 'Buyer Pipeline',
    color: '#f97316',
    emoji: null,
    pipelineType: 'buyer',
    defaultStages: [
      { name: 'New Lead', color: '#6b7280', position: 0 },
      { name: 'Pre-Approved', color: '#3b82f6', position: 1 },
      { name: 'Showings', color: '#8b5cf6', position: 2 },
      { name: 'Offer Made', color: '#f59e0b', position: 3 },
      { name: 'Under Contract', color: '#f97316', position: 4 },
      { name: 'Closing', color: '#10b981', position: 5 },
    ],
  },
];

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Check if pipelines already exist for this space
  const { data: existing, error: fetchError } = await supabase
    .from('Pipeline')
    .select('*')
    .eq('spaceId', space.id)
    .order('position', { ascending: true });
  if (fetchError) throw fetchError;

  if (existing && existing.length > 0) {
    return NextResponse.json(existing as Pipeline[]);
  }

  // Bootstrap: create default Rental + Buyer pipelines and back-fill existing stages
  const pipelines: Pipeline[] = [];

  for (let i = 0; i < DEFAULT_PIPELINES.length; i++) {
    const def = DEFAULT_PIPELINES[i];
    const pipelineId = crypto.randomUUID();

    const { data: pipeline, error: insertError } = await supabase
      .from('Pipeline')
      .insert({
        id: pipelineId,
        spaceId: space.id,
        name: def.name,
        color: def.color,
        emoji: def.emoji,
        position: i,
      })
      .select()
      .single();
    if (insertError) throw insertError;
    pipelines.push(pipeline as Pipeline);

    // Back-fill pipelineId on existing stages that match this pipelineType
    const { data: matchingStages, error: stagesError } = await supabase
      .from('DealStage')
      .select('id')
      .eq('spaceId', space.id)
      .eq('pipelineType', def.pipelineType)
      .is('pipelineId', null);
    if (stagesError) throw stagesError;

    if (matchingStages && matchingStages.length > 0) {
      const { error: updateError } = await supabase
        .from('DealStage')
        .update({ pipelineId })
        .in(
          'id',
          matchingStages.map((s: { id: string }) => s.id),
        )
        .eq('spaceId', space.id);
      if (updateError) throw updateError;
    } else {
      // No existing stages for this pipeline type — seed defaults
      const inserts = def.defaultStages.map((s) => ({
        id: crypto.randomUUID(),
        spaceId: space.id,
        name: s.name,
        color: s.color,
        position: s.position,
        pipelineType: def.pipelineType,
        pipelineId,
      }));
      const { error: seedError } = await supabase.from('DealStage').insert(inserts);
      if (seedError) throw seedError;
    }
  }

  return NextResponse.json(pipelines);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, name, color, emoji } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.trim().length > 100) {
    return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
  }

  const safeColor = typeof color === 'string' && HEX_COLOR.test(color) ? color : '#6366f1';
  const safeEmoji =
    typeof emoji === 'string' && emoji.trim().length > 0 && emoji.trim().length <= 8
      ? emoji.trim()
      : null;

  // Get the max position to append at end
  const { data: last, error: lastError } = await supabase
    .from('Pipeline')
    .select('position')
    .eq('spaceId', space.id)
    .order('position', { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  const position = last && last.length > 0 ? last[0].position + 1 : 0;

  const id = crypto.randomUUID();
  const { data: pipeline, error: insertError } = await supabase
    .from('Pipeline')
    .insert({
      id,
      spaceId: space.id,
      name: name.trim(),
      color: safeColor,
      emoji: safeEmoji,
      position,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  return NextResponse.json(pipeline as Pipeline, { status: 201 });
}
