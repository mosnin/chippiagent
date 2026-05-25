/**
 * Lead Scoring — public API consumed by API routes and server actions.
 *
 * v2: Uses Chippi's proprietary deterministic scoring engine (lib/scoring/engine.ts)
 * with optional AI enhancement for qualitative summaries (lib/scoring/enhance.ts).
 *
 * The score itself is now computed deterministically — no LLM dependency.
 * AI is only used for human-readable summaries and action recommendations.
 * If the AI call fails, deterministic fallbacks fill every field.
 */

import { computeLeadScore } from '@/lib/scoring/engine';
import { enhanceWithAI, deriveLeadState, deriveSummary, deriveExplanationTags } from '@/lib/scoring/enhance';
import { scoreDynamicApplication } from '@/lib/dynamic-lead-scoring';
import type { ApplicationData, IntakeFormConfig, LeadScoreDetails } from '@/lib/types';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';

export type LeadScoringResult = {
  scoringStatus: 'scored' | 'failed' | 'pending';
  leadScore: number | null;
  scoreLabel: string;
  scoreSummary: string | null;
  scoreDetails: LeadScoreDetails | null;
};

function tierToLabel(tier: string): 'hot' | 'warm' | 'cold' | 'unscored' {
  if (tier === 'hot') return 'hot';
  if (tier === 'warm') return 'warm';
  if (tier === 'cold' || tier === 'unqualified') return 'cold';
  return 'unscored';
}

export async function scoreLeadApplication(input: {
  contactId: string;
  name: string;
  email: string | null;
  phone: string;
  budget: number | null;
  applicationData: ApplicationData | null;
  leadType?: 'rental' | 'buyer';
}): Promise<LeadScoringResult> {
  console.info('[lead-scoring] start (v2 proprietary engine)', { contactId: input.contactId });

  try {
    // ── Step 1: Deterministic score (instant, no API call) ──────────────────
    const engineResult = computeLeadScore({
      name: input.name,
      email: input.email,
      phone: input.phone,
      budget: input.budget,
      applicationData: input.applicationData,
      leadType: input.leadType,
    });

    console.info('[lead-scoring] engine score computed', {
      contactId: input.contactId,
      score: engineResult.score,
      tier: engineResult.priorityTier,
      confidence: engineResult.confidence,
      categories: engineResult.categories.map((c) => `${c.category}:${Math.round(c.rawScore * 100)}`).join(', '),
    });

    // ── Step 2: AI enhancement (optional, for summaries only) ───────────────
    const enhancement = await enhanceWithAI(engineResult, {
      name: input.name,
      applicationData: input.applicationData,
      leadType: input.leadType,
    });

    // ── Step 3: Assemble LeadScoreDetails (same shape as before) ────────────
    const summary = enhancement?.summary ?? deriveSummary(engineResult, input.name);
    const explanationTags = enhancement?.explanationTags ?? deriveExplanationTags(engineResult);
    const recommendedNextAction = enhancement?.recommendedNextAction ?? deriveNextAction(engineResult, input.leadType);
    const leadState = enhancement?.leadState ?? deriveLeadState(engineResult, input.leadType);

    const qualificationStatus = engineResult.priorityTier === 'hot' || engineResult.priorityTier === 'warm'
      ? 'qualified'
      : engineResult.priorityTier === 'cold'
        ? 'needs_review'
        : 'unqualified';

    const urgencyScore = engineResult.categories
      .find((c) => c.category === 'moveInUrgency')?.rawScore ?? 0;
    const readinessStatus = urgencyScore >= 0.7 ? 'ready_now' : 'not_immediate';

    const details: LeadScoreDetails = {
      score: engineResult.score,
      priorityTier: engineResult.priorityTier,
      qualificationStatus,
      readinessStatus,
      confidence: engineResult.confidence,
      summary,
      explanationTags,
      strengths: engineResult.strengths,
      weaknesses: engineResult.weaknesses,
      riskFlags: engineResult.riskFlags,
      missingInformation: engineResult.missingInformation,
      recommendedNextAction,
      leadState,
    };

    console.info('[lead-scoring] complete', {
      contactId: input.contactId,
      score: engineResult.score,
      tier: engineResult.priorityTier,
      leadState,
      aiEnhanced: enhancement !== null,
    });

    return {
      scoringStatus: 'scored',
      leadScore: engineResult.score,
      scoreLabel: tierToLabel(engineResult.priorityTier),
      scoreSummary: summary.slice(0, 300),
      scoreDetails: details,
    };
  } catch (error) {
    console.error('[lead-scoring] engine failed', { contactId: input.contactId, error });
    return failedResult();
  }
}

function deriveNextAction(result: ReturnType<typeof computeLeadScore>, leadType?: 'rental' | 'buyer'): string {
  if (leadType === 'buyer') {
    if (result.priorityTier === 'hot') return 'Schedule showing or buyer consultation within 2 hours';
    if (result.priorityTier === 'warm') return 'Send property listings and follow up within 24 hours';
    if (result.missingInformation.length >= 3) return 'Request pre-approval and buyer preferences';
    if (result.priorityTier === 'cold') return 'Add to nurture campaign with market updates';
    return 'Review buyer profile for qualification';
  }

  // Rental (default)
  if (result.priorityTier === 'hot') return 'Schedule tour or call within 2 hours';
  if (result.priorityTier === 'warm') return 'Send follow-up within 24 hours';
  if (result.missingInformation.length >= 3) return 'Request additional application details';
  if (result.priorityTier === 'cold') return 'Add to weekly follow-up queue';
  return 'Review application for disqualifying factors';
}

function failedResult(): LeadScoringResult {
  return {
    scoringStatus: 'failed',
    leadScore: null,
    scoreLabel: 'unscored',
    scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
    scoreDetails: null,
  };
}

/**
 * Dynamic scoring entry point — routes to the appropriate scoring pipeline.
 *
 * If `formConfig` is provided, uses the new dynamic scoring pipeline
 * that handles arbitrary form questions and scoring rules.
 *
 * If `formConfig` is null/undefined, falls back to the existing
 * `scoreLeadApplication()` for legacy hardcoded forms.
 */
export async function scoreLeadApplicationDynamic(input: {
  contactId: string;
  formConfig: IntakeFormConfig | null;
  answers?: Record<string, string | string[] | number | boolean>;
  leadType?: 'rental' | 'buyer' | 'general';
  scoringModel?: ScoringModel | null;
  // Legacy fields — used when formConfig is null
  name?: string;
  email?: string | null;
  phone?: string;
  budget?: number | null;
  applicationData?: ApplicationData | null;
}): Promise<LeadScoringResult> {
  // Route to dynamic scoring when a form config is present
  if (input.formConfig && input.answers) {
    return scoreDynamicApplication({
      contactId: input.contactId,
      formConfig: input.formConfig,
      answers: input.answers,
      leadType: input.leadType ?? input.formConfig.leadType ?? 'rental',
      scoringModel: input.scoringModel ?? undefined,
    });
  }

  // Warn if formConfig exists but answers are missing (likely a bug)
  if (input.formConfig && !input.answers) {
    console.warn('[lead-scoring] formConfig provided without answers — cannot use dynamic scoring, falling back to legacy', {
      contactId: input.contactId,
      hasFormConfig: true,
      hasAnswers: false,
    });
  }

  // Fall back to legacy scoring for hardcoded forms
  if (input.name && input.phone) {
    return scoreLeadApplication({
      contactId: input.contactId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone,
      budget: input.budget ?? null,
      applicationData: input.applicationData ?? null,
      leadType: (input.leadType === 'general' ? 'rental' : input.leadType) as 'rental' | 'buyer' | undefined,
    });
  }

  // Cannot score without minimum required data
  console.warn('[lead-scoring] scoreLeadApplicationDynamic called with insufficient data', {
    contactId: input.contactId,
    hasFormConfig: !!input.formConfig,
    hasAnswers: !!input.answers,
    hasName: !!input.name,
  });
  return failedResult();
}
