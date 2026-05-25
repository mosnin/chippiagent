/**
 * Deterministic Rule-Based Scorer for Dynamic Forms
 *
 * Pure function that evaluates form answers against explicitly configured
 * scoring mappings. No AI/LLM dependency — instant, consistent results.
 *
 * How it works:
 *   1. Iterate through all questions that have `scoring.mappings`
 *   2. Match each answer to its configured point mapping
 *   3. Return a weighted 0-100 score with per-question breakdown
 */

import type { IntakeFormConfig, FormQuestion } from '@/lib/types';
import type { ScoringModel } from './scoring-model-types';

export type DeterministicBreakdownItem = {
  questionId: string;
  label: string;
  points: number;
  maxPoints: number;
  weight: number;
  matched: boolean;
};

export type DeterministicScoringResult = {
  score: number; // 0-100
  maxPossible: number;
  breakdown: DeterministicBreakdownItem[];
  hasRules: boolean; // true if any question had scoring mappings
  /** Fraction (0-1) of total scoring weight covered by deterministic rules. */
  weightCoverage: number;
};

type Answers = Record<string, string | string[] | number | boolean>;

/**
 * Compute a deterministic score from form config scoring rules + answers.
 *
 * For each question with `scoring.mappings`, we try to match the answer:
 *   - select / radio: exact value match
 *   - multi_select: sum points for all selected values
 *   - checkbox: match "true" / "false" string
 *   - text / textarea / email / phone: case-insensitive contains match
 *   - number: exact string match against the numeric value
 *   - date: exact match
 *
 * Each question's matched points are weighted by `scoring.weight`.
 * Final score = sum(matched * weight) / sum(maxPossible * weight) * 100.
 */
export function computeDeterministicScore(
  formConfig: IntakeFormConfig,
  answers: Answers,
): DeterministicScoringResult {
  const breakdown: DeterministicBreakdownItem[] = [];
  let weightedPointsEarned = 0;
  let weightedMaxPossible = 0;
  let hasRules = false;

  // Track total scoring weight across ALL scored questions (with or without
  // mappings) so callers can determine how much of the form the deterministic
  // engine actually covers. Questions with weight but no mappings (e.g. number
  // fields) cannot be scored deterministically.
  let totalScoringWeight = 0;
  let coveredScoringWeight = 0;

  for (const section of formConfig.sections) {
    for (const question of section.questions) {
      const scoring = question.scoring;
      if (!scoring) continue;

      const weight = scoring.weight;
      if (weight <= 0) continue;

      totalScoringWeight += weight;

      // Resolve mappings: use explicit mappings if present, otherwise
      // auto-derive from options[].scoreValue (a common pattern in form
      // templates where each option carries its own point value).
      const mappings = resolveMappings(question);
      if (!mappings || mappings.length === 0) continue;

      hasRules = true;
      coveredScoringWeight += weight;

      const maxPoints = getMaxPoints(mappings);
      const answer = answers[question.id];
      const points = matchAnswer(question, answer, mappings);

      breakdown.push({
        questionId: question.id,
        label: question.label,
        points,
        maxPoints,
        weight,
        matched: points > 0,
      });

      weightedPointsEarned += points * weight;
      weightedMaxPossible += maxPoints * weight;
    }
  }

  if (!hasRules || weightedMaxPossible === 0) {
    return {
      score: 0,
      maxPossible: 0,
      breakdown: [],
      hasRules: false,
      weightCoverage: 0,
    };
  }

  const score = Math.round((weightedPointsEarned / weightedMaxPossible) * 100);

  return {
    score: Math.max(0, Math.min(100, score)),
    maxPossible: weightedMaxPossible,
    breakdown,
    hasRules: true,
    weightCoverage:
      totalScoringWeight > 0 ? coveredScoringWeight / totalScoringWeight : 0,
  };
}

/**
 * Resolve scoring mappings for a question.
 *
 * Priority:
 *   1. Explicit `scoring.mappings` — always wins
 *   2. Derived from `options[].scoreValue` — if at least one option has a
 *      scoreValue, build mappings from those (options without scoreValue get 0)
 *   3. null — no deterministic scoring possible (e.g. number/text fields
 *      without mappings)
 */
function resolveMappings(
  question: FormQuestion,
): { value: string; points: number }[] | null {
  // 1. Explicit mappings
  if (question.scoring?.mappings && question.scoring.mappings.length > 0) {
    return question.scoring.mappings;
  }

  // 2. Derive from options[].scoreValue
  if (question.options && question.options.length > 0) {
    const hasAnyScoreValue = question.options.some(
      (o) => o.scoreValue != null && o.scoreValue > 0,
    );
    if (hasAnyScoreValue) {
      return question.options.map((o) => ({
        value: o.value,
        points: o.scoreValue ?? 0,
      }));
    }
  }

  // 3. No deterministic scoring possible
  return null;
}

/**
 * Get the maximum possible points from a set of mappings.
 */
function getMaxPoints(mappings: { value: string; points: number }[]): number {
  if (mappings.length === 0) return 0;
  return Math.max(...mappings.map((m) => m.points));
}

/**
 * Match an answer against scoring mappings and return earned points.
 */
function matchAnswer(
  question: FormQuestion,
  answer: string | string[] | number | boolean | undefined,
  mappings: { value: string; points: number }[],
): number {
  // Unanswered questions get 0 points
  if (answer === undefined || answer === null || answer === '') {
    return 0;
  }

  const questionType = question.type;

  switch (questionType) {
    case 'select':
    case 'radio': {
      // Exact value match
      const answerStr = String(answer).trim().toLowerCase();
      for (const mapping of mappings) {
        if (mapping.value.trim().toLowerCase() === answerStr) {
          return mapping.points;
        }
      }
      return 0;
    }

    case 'multi_select': {
      // Sum points for all selected values
      const selected = Array.isArray(answer) ? answer : [String(answer)];
      let total = 0;
      for (const val of selected) {
        const valLower = val.trim().toLowerCase();
        for (const mapping of mappings) {
          if (mapping.value.trim().toLowerCase() === valLower) {
            total += mapping.points;
          }
        }
      }
      // Cap at the max single mapping value to keep scoring proportional
      const maxPoints = getMaxPoints(mappings);
      return Math.min(total, maxPoints);
    }

    case 'checkbox': {
      // Boolean: match "true" or "false" mapping
      const boolStr = String(Boolean(answer)).toLowerCase();
      for (const mapping of mappings) {
        if (mapping.value.trim().toLowerCase() === boolStr) {
          return mapping.points;
        }
      }
      return 0;
    }

    case 'number': {
      // Try exact string match first, then numeric comparison
      const numStr = String(answer).trim();
      for (const mapping of mappings) {
        if (mapping.value.trim() === numStr) {
          return mapping.points;
        }
      }
      // Also try numeric equality for cases like "5000" matching "5000"
      const numVal = Number(answer);
      if (!isNaN(numVal)) {
        for (const mapping of mappings) {
          const mappingNum = Number(mapping.value.trim());
          if (!isNaN(mappingNum) && mappingNum === numVal) {
            return mapping.points;
          }
        }
      }
      return 0;
    }

    case 'text':
    case 'textarea':
    case 'email':
    case 'phone': {
      // Case-insensitive contains match
      const answerStr = String(answer).trim().toLowerCase();
      let bestPoints = 0;
      for (const mapping of mappings) {
        const mappingVal = mapping.value.trim().toLowerCase();
        if (answerStr === mappingVal || answerStr.includes(mappingVal)) {
          bestPoints = Math.max(bestPoints, mapping.points);
        }
      }
      return bestPoints;
    }

    case 'date': {
      // Exact match for date values
      const answerStr = String(answer).trim();
      for (const mapping of mappings) {
        if (mapping.value.trim() === answerStr) {
          return mapping.points;
        }
      }
      return 0;
    }

    default:
      return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Model-based scoring — uses ScoringModel from AI generation
// ═══════════════════════════════════════════════════════════════════════════

export type ModelScoringResult = {
  score: number; // 0-100
  breakdown: {
    questionId: string;
    label: string;
    weight: number;
    points: number; // 0-100 raw points for this question
    weightedContribution: number; // (points/100) * (weight/totalWeight) * 100
    matched: boolean;
  }[];
  hasModel: boolean;
};

/**
 * Score answers using an AI-generated ScoringModel.
 *
 * For questions with `ranges`, matches the numeric answer to a range bucket.
 * For questions with `optionScores`, maps the selected option value to its score.
 * The final score = sum of (points/100) * (weight/totalWeight) * 100 across all
 * scored questions, yielding a 0-100 result.
 */
export function computeModelBasedScore(
  formConfig: IntakeFormConfig,
  answers: Answers,
  model: ScoringModel,
): ModelScoringResult {
  const breakdown: ModelScoringResult['breakdown'] = [];

  // Build a lookup of all questions by ID
  const questionMap = new Map<string, FormQuestion>();
  for (const section of formConfig.sections) {
    for (const q of section.questions) {
      questionMap.set(q.id, q);
    }
  }

  let totalScore = 0;
  const totalWeight = Object.values(model.weights).reduce((s, w) => s + w.weight, 0) || 100;

  for (const [questionId, qModel] of Object.entries(model.weights)) {
    if (qModel.weight <= 0) continue;

    const question = questionMap.get(questionId);
    const label = question?.label || questionId;
    const answer = answers[questionId];

    let points = 0;
    let matched = false;

    if (answer !== undefined && answer !== null && answer !== '') {
      // Try range matching for number fields
      if (qModel.ranges && qModel.ranges.length > 0) {
        const numVal = Number(answer);
        if (!isNaN(numVal)) {
          for (const range of qModel.ranges) {
            if (numVal >= range.min && (range.max === null || numVal < range.max)) {
              points = range.points;
              matched = true;
              break;
            }
          }
        }
      }

      // Try option score matching for radio/select/multi_select
      if (!matched && qModel.optionScores) {
        if (Array.isArray(answer)) {
          // multi_select: sum matched option scores, capped at 100
          let total = 0;
          for (const raw of answer) {
            const answerStr = String(raw).trim().toLowerCase();
            for (const [optValue, optPoints] of Object.entries(qModel.optionScores)) {
              if (optValue.toLowerCase() === answerStr) {
                total += optPoints;
                break;
              }
            }
          }
          points = Math.min(100, total);
          matched = points > 0;
        } else {
          const answerStr = String(answer).trim().toLowerCase();
          for (const [optValue, optPoints] of Object.entries(qModel.optionScores)) {
            if (optValue.toLowerCase() === answerStr) {
              points = optPoints;
              matched = true;
              break;
            }
          }
        }
      }
    }

    const weightedContribution = (points / 100) * (qModel.weight / totalWeight) * 100;
    totalScore += weightedContribution;

    breakdown.push({
      questionId,
      label,
      weight: qModel.weight,
      points,
      weightedContribution: Math.round(weightedContribution * 100) / 100,
      matched,
    });
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(totalScore))),
    breakdown,
    hasModel: Object.keys(model.weights).length > 0,
  };
}
