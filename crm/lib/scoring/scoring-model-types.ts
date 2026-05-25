/**
 * Types for AI-generated scoring models.
 *
 * A ScoringModel distributes importance weights across all scorable questions
 * in an intake form, summing to exactly 100. For radio/select questions it
 * includes per-option point values; for number fields it includes range buckets.
 *
 * Separate models are generated for rental vs buyer forms because different
 * real estate signals carry different importance.
 */

export interface NumberRange {
  min: number;
  max: number | null; // null = unlimited upper bound
  points: number; // 0-100
  label?: string;
}

export interface QuestionScoringModel {
  weight: number; // 0-100, all weights across the model sum to 100
  optionScores?: Record<string, number>; // for radio/select: option value -> 0-100 score
  ranges?: NumberRange[]; // for number fields: range buckets with point values
}

export interface ScoringModel {
  weights: Record<string, QuestionScoringModel>;
  totalWeight: 100;
  reasoning: string;
  generatedAt: string; // ISO 8601
  leadType: 'rental' | 'buyer';
}

/**
 * The raw JSON shape GPT-4o-mini returns (before we attach metadata).
 */
export interface ScoringModelAIResponse {
  weights: Record<
    string,
    {
      weight: number;
      optionScores?: Record<string, number>;
      ranges?: {
        min: number;
        max: number | null;
        points: number;
        label?: string;
      }[];
    }
  >;
  totalWeight: number;
  reasoning: string;
}
