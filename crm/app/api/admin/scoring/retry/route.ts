import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { scoreLeadApplicationDynamic } from '@/lib/lead-scoring';
import type { LeadScoringResult } from '@/lib/lead-scoring';
import { getFormConfigs } from '@/lib/form-builder';
import { formConfigSchema, type IntakeFormConfig } from '@/lib/form-config-schema';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';
import type { ApplicationData } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let admin: { userId: string };
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { allowed } = await checkRateLimit(`retry-scoring:${admin.userId}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many retries. Try again shortly.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const contactId = typeof body.contactId === 'string' ? body.contactId : '';
  if (!contactId || !UUID_RE.test(contactId)) {
    return NextResponse.json({ error: 'Invalid contactId' }, { status: 400 });
  }

  try {
    const { data: contactRow, error: fetchErr } = await supabase
      .from('Contact')
      .select(
        'id, spaceId, name, email, phone, budget, leadType, formLeadType, applicationData, formConfigSnapshot, scoringStatus, Space(id, brokerageId)',
      )
      .eq('id', contactId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!contactRow) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const contact = contactRow as unknown as {
      id: string;
      spaceId: string;
      name: string;
      email: string | null;
      phone: string | null;
      budget: number | null;
      leadType: 'rental' | 'buyer';
      formLeadType: 'rental' | 'buyer' | null;
      applicationData: Record<string, unknown> | null;
      formConfigSnapshot: IntakeFormConfig | null;
      scoringStatus: string;
      Space: { id: string; brokerageId: string | null } | null;
    };

    const oldStatus = contact.scoringStatus;
    const resolvedLeadType: 'rental' | 'buyer' =
      contact.formLeadType ?? contact.leadType ?? 'rental';

    // Mark as pending immediately so the UI reflects in-flight state
    await supabase
      .from('Contact')
      .update({ scoringStatus: 'pending', updatedAt: new Date().toISOString() })
      .eq('id', contact.id);

    // Resolve form config: prefer the snapshot stored with the contact,
    // fall back to current configured form for the space.
    let formConfig: IntakeFormConfig | null = null;
    if (contact.formConfigSnapshot) {
      const parsed = formConfigSchema.safeParse(contact.formConfigSnapshot);
      if (parsed.success) formConfig = parsed.data;
    }
    if (!formConfig && contact.Space) {
      try {
        const dual = await getFormConfigs(contact.spaceId, contact.Space.brokerageId);
        formConfig = resolvedLeadType === 'buyer' ? dual.buyer : dual.rental;
      } catch (err) {
        console.warn('[retry-scoring] getFormConfigs failed', { err });
      }
    }

    // Resolve scoring model
    let scoringModel: ScoringModel | null = null;
    try {
      const scoringColumn =
        resolvedLeadType === 'buyer' ? 'buyerScoringModel' : 'rentalScoringModel';
      const { data: settingRow } = await supabase
        .from('SpaceSetting')
        .select(scoringColumn)
        .eq('spaceId', contact.spaceId)
        .maybeSingle();
      if (settingRow) {
        scoringModel = (settingRow as Record<string, unknown>)[scoringColumn] as
          | ScoringModel
          | null;
      }
    } catch (err) {
      console.warn('[retry-scoring] scoring model fetch failed', { err });
    }

    const applicationData = (contact.applicationData ?? {}) as Record<string, unknown>;

    let scoring: LeadScoringResult;
    try {
      scoring = await scoreLeadApplicationDynamic({
        contactId: contact.id,
        formConfig,
        answers: formConfig
          ? (applicationData as Record<string, string | string[] | number | boolean>)
          : undefined,
        name: contact.name,
        email: contact.email,
        phone: contact.phone ?? '',
        budget: contact.budget,
        applicationData: !formConfig
          ? (applicationData as ApplicationData | null)
          : undefined,
        leadType: resolvedLeadType,
        scoringModel,
      });
    } catch (err) {
      console.error('[retry-scoring] scoring threw', { contactId: contact.id, err });
      await supabase
        .from('Contact')
        .update({
          scoringStatus: 'failed',
          scoreSummary: 'Scoring unavailable right now.',
          updatedAt: new Date().toISOString(),
        })
        .eq('id', contact.id);

      await logAdminAction({
        actor: admin.userId,
        action: 'retry_scoring',
        target: contact.id,
        details: { oldStatus, newStatus: 'failed', error: err instanceof Error ? err.message : String(err) },
      });

      return NextResponse.json(
        { success: false, scoringStatus: 'failed', error: 'Scoring failed' },
        { status: 200 },
      );
    }

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({
        scoringStatus: scoring.scoringStatus,
        leadScore: scoring.leadScore,
        scoreLabel: scoring.scoreLabel,
        scoreSummary: scoring.scoreSummary,
        scoreDetails: scoring.scoreDetails,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', contact.id);
    if (updateErr) throw updateErr;

    await logAdminAction({
      actor: admin.userId,
      action: 'retry_scoring',
      target: contact.id,
      details: { oldStatus, newStatus: scoring.scoringStatus, scoreLabel: scoring.scoreLabel },
    });

    return NextResponse.json({
      success: true,
      scoringStatus: scoring.scoringStatus,
      leadScore: scoring.leadScore,
      scoreLabel: scoring.scoreLabel,
    });
  } catch (err) {
    console.error('[retry-scoring] unhandled failure', { err });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
