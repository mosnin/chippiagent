import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { scoreLeadApplicationDynamic } from '@/lib/lead-scoring';
import { checkRateLimit } from '@/lib/rate-limit';
import type { Contact, IntakeFormConfig } from '@/lib/types';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Rate limit: max 10 rescore requests per user per hour
  const { allowed } = await checkRateLimit(`rescore:${userId}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
  }

  const { id } = await params;

  // Get space first, then query contact scoped to that space to prevent
  // cross-tenant information disclosure.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rows, error: fetchError } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id);
  if (fetchError) {
    console.error('[rescore] Fetch error:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
  }
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = rows[0] as Contact;

  // Mark as pending while scoring
  await supabase
    .from('Contact')
    .update({ scoringStatus: 'pending' })
    .eq('id', id);

  // Fetch the form config snapshot and scoring model for dynamic scoring.
  // The formConfigSnapshot is stored on the contact at submission time.
  // The scoringModel is stored on SpaceSetting.
  const formConfig: IntakeFormConfig | null =
    (contact as Record<string, unknown>).formConfigSnapshot as IntakeFormConfig | null ?? null;

  let scoringModel: ScoringModel | null = null;
  const resolvedLeadType = contact.leadType || (contact as any).formLeadType || 'rental';
  if (formConfig) {
    try {
      const scoringColumn = resolvedLeadType === 'buyer'
        ? 'buyerScoringModel'
        : 'rentalScoringModel';
      const { data: scoringSettings } = await supabase
        .from('SpaceSetting')
        .select(scoringColumn)
        .eq('spaceId', space.id)
        .maybeSingle();
      if (scoringSettings) {
        scoringModel = (scoringSettings as Record<string, unknown>)[scoringColumn] as ScoringModel | null;
      }
    } catch (err) {
      console.warn('[rescore] scoring model fetch failed (non-fatal)', {
        contactId: id,
        spaceId: space.id,
        err,
      });
    }
  }

  // Use dynamic scoring when a formConfig snapshot exists on the contact,
  // otherwise fall back to legacy scoring via the same entry point.
  const applicationData = contact.applicationData as Record<string, unknown> | null;

  let result;
  try {
    result = await scoreLeadApplicationDynamic({
      contactId: id,
      formConfig,
      answers: formConfig && applicationData
        ? (applicationData as Record<string, string | string[] | number | boolean>)
        : undefined,
      scoringModel,
      name: contact.name,
      email: contact.email,
      phone: contact.phone ?? '',
      budget: contact.budget,
      applicationData: !formConfig
        ? (applicationData as (Record<string, unknown> & { legalName: string }) | null)
        : undefined,
      leadType: resolvedLeadType as 'rental' | 'buyer',
    });
  } catch (scoringErr) {
    // Reset status to 'failed' so the contact is not stuck in 'pending'
    await supabase
      .from('Contact')
      .update({ scoringStatus: 'failed', updatedAt: new Date().toISOString() })
      .eq('id', id);
    console.error('[rescore] Scoring failed:', scoringErr);
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('Contact')
    .update({
      scoringStatus: result.scoringStatus,
      leadScore: result.leadScore,
      scoreLabel: result.scoreLabel,
      scoreSummary: result.scoreSummary,
      scoreDetails: result.scoreDetails,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    console.error('[rescore] Update error:', updateError);
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }

  return NextResponse.json(result);
}
