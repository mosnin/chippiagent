/**
 * Dynamic Lead Scoring — for custom/dynamic intake forms.
 *
 * Hybrid approach:
 *   1. Deterministic rule-based score from explicit answer mappings (instant)
 *   2. AI enhancement via GPT-4o-mini for qualitative assessment
 *   3. Blended final score with tier assignment
 *
 * Falls back gracefully at every step — never blocks form submission.
 */

import { computeDeterministicScore, computeModelBasedScore } from '@/lib/scoring/deterministic-scorer';
import {
  buildDynamicScoringPrompt,
  buildDynamicSystemPrompt,
} from '@/lib/scoring/dynamic-prompt-builder';
import type { IntakeFormConfig, LeadScoreDetails } from '@/lib/types';
import type { LeadScoringResult } from '@/lib/lead-scoring';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';

type DynamicScoringInput = {
  contactId: string;
  formConfig: IntakeFormConfig;
  answers: Record<string, string | string[] | number | boolean>;
  leadType: string;
  scoringModel?: ScoringModel;
};

type AIScoreResponse = {
  leadScore: number;
  scoreLabel: string;
  scoreSummary: string;
  scoreDetails: {
    tags: string[];
    strengths: string[];
    weaknesses: string[];
    riskFlags: string[];
  };
};

// ── Tier assignment (same thresholds as existing engine) ─────────────────

function assignTier(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 75) return 'hot';
  if (score >= 45) return 'warm';
  return 'cold';
}

function tierToLabel(tier: string): 'hot' | 'warm' | 'cold' | 'unscored' {
  if (tier === 'hot') return 'hot';
  if (tier === 'warm') return 'warm';
  if (tier === 'cold') return 'cold';
  return 'unscored';
}

// ── Lazy OpenAI import (same pattern as enhance.ts) ──────────────────────

async function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }
  const { default: OpenAIClient } = await import('openai');
  return new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY });
}

// ── AI scoring call ──────────────────────────────────────────────────────

async function getAIScore(input: {
  formConfig: IntakeFormConfig;
  answers: Record<string, string | string[] | number | boolean>;
  leadType: string;
  deterministicScore: number | null;
}): Promise<AIScoreResponse | null> {
  try {
    const openai = await getOpenAIClient();

    const userPrompt = buildDynamicScoringPrompt({
      formConfig: input.formConfig,
      answers: input.answers,
      deterministicScore: input.deterministicScore,
    });

    const systemPrompt = buildDynamicSystemPrompt({
      leadType: input.leadType,
      hasDeterministicScore: input.deterministicScore !== null,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0,
      max_tokens: 400,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'dynamic_lead_score',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              leadScore: { type: 'number' },
              scoreLabel: { type: 'string', enum: ['hot', 'warm', 'cold'] },
              scoreSummary: { type: 'string' },
              scoreDetails: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  tags: { type: 'array', items: { type: 'string' } },
                  strengths: { type: 'array', items: { type: 'string' } },
                  weaknesses: { type: 'array', items: { type: 'string' } },
                  riskFlags: { type: 'array', items: { type: 'string' } },
                },
                required: ['tags', 'strengths', 'weaknesses', 'riskFlags'],
              },
            },
            required: ['leadScore', 'scoreLabel', 'scoreSummary', 'scoreDetails'],
          },
        },
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AIScoreResponse;

    // Clamp AI score to 0-100
    parsed.leadScore = Math.max(0, Math.min(100, Math.round(parsed.leadScore)));

    return parsed;
  } catch (error) {
    console.warn('[dynamic-lead-scoring] AI scoring failed, using deterministic only', { error });
    return null;
  }
}

// ── Data completeness from form config ───────────────────────────────────

function computeFormCompleteness(
  formConfig: IntakeFormConfig,
  answers: Record<string, string | string[] | number | boolean>,
): number {
  let totalQuestions = 0;
  let answeredQuestions = 0;

  for (const section of formConfig.sections) {
    for (const question of section.questions) {
      totalQuestions++;
      const answer = answers[question.id];
      if (answer !== undefined && answer !== null && answer !== '') {
        answeredQuestions++;
      }
    }
  }

  if (totalQuestions === 0) return 0;
  return Math.round((answeredQuestions / totalQuestions) * 100) / 100;
}

// ── Missing required fields ──────────────────────────────────────────────

function collectMissingRequired(
  formConfig: IntakeFormConfig,
  answers: Record<string, string | string[] | number | boolean>,
): string[] {
  const missing: string[] = [];
  for (const section of formConfig.sections) {
    for (const question of section.questions) {
      if (!question.required) continue;
      const answer = answers[question.id];
      if (answer === undefined || answer === null || answer === '') {
        missing.push(question.label);
      }
    }
  }
  return missing.slice(0, 5);
}

// ── Derive recommended next action ──────────────────────────────────────

function deriveNextAction(tier: string, leadType: string): string {
  if (leadType === 'buyer') {
    if (tier === 'hot') return 'Schedule showing or buyer consultation within 2 hours';
    if (tier === 'warm') return 'Send property listings and follow up within 24 hours';
    return 'Add to nurture campaign with market updates';
  }
  // rental / general
  if (tier === 'hot') return 'Schedule tour or call within 2 hours';
  if (tier === 'warm') return 'Send follow-up within 24 hours';
  return 'Add to weekly follow-up queue';
}

// ── Derive lead state ────────────────────────────────────────────────────

function deriveLeadState(
  tier: string,
  leadType: string,
  completeness: number,
  missingCount: number,
): string {
  if (completeness < 0.3) return 'incomplete_application';
  if (missingCount >= 3) return 'needs_additional_info';

  if (leadType === 'buyer') {
    if (tier === 'hot') return 'high_priority_qualified_buyer';
    if (tier === 'warm') return 'qualified_buyer_low_urgency';
    return 'likely_unqualified';
  }

  if (tier === 'hot') return 'high_priority_qualified_renter';
  if (tier === 'warm') return 'qualified_low_urgency';
  return 'likely_unqualified';
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

export async function scoreDynamicApplication(
  input: DynamicScoringInput,
): Promise<LeadScoringResult> {
  const { contactId, formConfig, answers, leadType, scoringModel } = input;

  console.info('[dynamic-lead-scoring] start', { contactId, leadType, hasScoringModel: !!scoringModel });

  try {
    // ── Step 1: Deterministic rule-based score ──────────────────────────
    // If a ScoringModel is available (AI-generated with ranges + optionScores),
    // use model-based scoring. Otherwise fall back to the legacy formConfig
    // mapping-based scorer.
    let deterministicResult: {
      score: number;
      hasRules: boolean;
      breakdown: { questionId: string; label: string; weight: number; points: number; matched: boolean }[];
      weightCoverage: number;
    };

    if (scoringModel && Object.keys(scoringModel.weights).length > 0) {
      const modelResult = computeModelBasedScore(formConfig, answers, scoringModel);
      deterministicResult = {
        score: modelResult.score,
        hasRules: modelResult.hasModel,
        breakdown: modelResult.breakdown.map((b) => ({
          questionId: b.questionId,
          label: b.label,
          weight: b.weight,
          points: b.points,
          matched: b.matched,
        })),
        // Model-based scoring covers all weighted questions by design
        weightCoverage: 1.0,
      };
      console.info('[dynamic-lead-scoring] model-based score used', {
        contactId,
        score: modelResult.score,
        hasModel: modelResult.hasModel,
        questionCount: modelResult.breakdown.length,
        matchedCount: modelResult.breakdown.filter((b) => b.matched).length,
      });
    } else {
      const legacyResult = computeDeterministicScore(formConfig, answers);
      deterministicResult = {
        score: legacyResult.score,
        hasRules: legacyResult.hasRules,
        breakdown: legacyResult.breakdown.map((b) => ({
          questionId: b.questionId,
          label: b.label,
          weight: b.weight,
          points: b.points,
          matched: b.matched,
        })),
        weightCoverage: legacyResult.weightCoverage,
      };
    }

    console.info('[dynamic-lead-scoring] deterministic score', {
      contactId,
      score: deterministicResult.score,
      hasRules: deterministicResult.hasRules,
      ruleCount: deterministicResult.breakdown.length,
      usedScoringModel: !!scoringModel,
    });

    // ── Step 2: AI enhancement ──────────────────────────────────────────
    const aiResult = await getAIScore({
      formConfig,
      answers,
      leadType,
      deterministicScore: deterministicResult.hasRules ? deterministicResult.score : null,
    });

    console.info('[dynamic-lead-scoring] AI score', {
      contactId,
      aiScore: aiResult?.leadScore ?? null,
      aiAvailable: aiResult !== null,
    });

    // ── Step 3: Blend final score ───────────────────────────────────────
    // When a user has configured a scoring model, the deterministic score
    // should be the primary signal — the user explicitly set their weights.
    // AI serves as a secondary quality check, not the majority opinion.
    let finalScore: number;
    let scoreSource: string;

    if (deterministicResult.hasRules && aiResult) {
      // Both available: deterministic-primary blend
      // With a scoring model (coverage ~1.0), deterministic gets 80% weight
      // Without a model (legacy, coverage <1.0), AI gets more influence
      const coverage = deterministicResult.weightCoverage; // 0-1
      const deterministicWeight = coverage >= 0.8 ? 0.8 : 0.4 + (coverage * 0.4);
      const aiWeight = 1 - deterministicWeight;

      finalScore = Math.round(
        deterministicResult.score * deterministicWeight +
          aiResult.leadScore * aiWeight,
      );
      scoreSource = coverage >= 0.8 ? 'hybrid_model' : 'hybrid_ai_heavy';

      console.info('[dynamic-lead-scoring] blend weights', {
        contactId,
        coverage: Math.round(coverage * 100),
        deterministicWeight: Math.round(deterministicWeight * 100),
        aiWeight: Math.round(aiWeight * 100),
      });
    } else if (deterministicResult.hasRules) {
      // Only deterministic (AI failed)
      finalScore = deterministicResult.score;
      scoreSource = 'deterministic';
    } else if (aiResult) {
      // Only AI (no scoring rules configured)
      finalScore = aiResult.leadScore;
      scoreSource = 'ai';
    } else {
      // Neither available — cannot score
      console.warn('[dynamic-lead-scoring] no scoring source available', { contactId });
      return failedResult();
    }

    finalScore = Math.max(0, Math.min(100, finalScore));
    const tier = assignTier(finalScore);

    // ── Assemble LeadScoreDetails ───────────────────────────────────────
    const completeness = computeFormCompleteness(formConfig, answers);
    const missingRequired = collectMissingRequired(formConfig, answers);

    const summary =
      aiResult?.scoreSummary?.slice(0, 200) ??
      `Lead scored ${finalScore}/100 (${tier}) via ${scoreSource} scoring.`;

    const explanationTags = aiResult?.scoreDetails?.tags?.slice(0, 5) ?? [];
    const strengths = aiResult?.scoreDetails?.strengths?.slice(0, 5) ?? [];
    const weaknesses = aiResult?.scoreDetails?.weaknesses?.slice(0, 5) ?? [];
    const riskFlags = aiResult?.scoreDetails?.riskFlags?.slice(0, 5) ?? [];

    const qualificationStatus =
      tier === 'hot' || tier === 'warm' ? 'qualified' : 'needs_review';
    const readinessStatus =
      tier === 'hot' ? 'ready_now' : 'not_immediate';

    const details: LeadScoreDetails = {
      score: finalScore,
      priorityTier: tier === 'hot' ? 'hot' : tier === 'warm' ? 'warm' : 'cold',
      qualificationStatus,
      readinessStatus,
      confidence: completeness,
      summary,
      explanationTags,
      strengths,
      weaknesses,
      riskFlags,
      missingInformation: missingRequired,
      recommendedNextAction: aiResult?.scoreDetails
        ? deriveNextAction(tier, leadType)
        : deriveNextAction(tier, leadType),
      leadState: deriveLeadState(tier, leadType, completeness, missingRequired.length),
    };

    console.info('[dynamic-lead-scoring] complete', {
      contactId,
      finalScore,
      tier,
      scoreSource,
      completeness,
    });

    return {
      scoringStatus: 'scored',
      leadScore: finalScore,
      scoreLabel: tierToLabel(tier),
      scoreSummary: summary.slice(0, 300),
      scoreDetails: details,
    };
  } catch (error) {
    console.error('[dynamic-lead-scoring] failed', { contactId, error });
    return failedResult();
  }
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
