/**
 * Chippi Proprietary Lead Scoring Engine
 *
 * Deterministic, weighted scoring system for rental and buyer leads.
 * Produces consistent scores across runs — no LLM dependency for the score itself.
 *
 * Architecture:
 *   1. Each scoring category computes a 0-1 normalized sub-score
 *   2. Sub-scores are multiplied by configurable weights (summing to 1.0)
 *   3. Risk flags apply multiplicative penalties
 *   4. Final score is 0-100 with tier assignment
 *   5. AI enhancement (optional) adds qualitative summary + recommendations
 */

import type { ApplicationData } from '@/lib/types';

// ── Scoring weights — must sum to 1.0 ─────────────────────────────────────

export const DEFAULT_WEIGHTS = {
  affordability: 0.30,
  employmentStability: 0.20,
  moveInUrgency: 0.20,
  applicationCompleteness: 0.15,
  householdFit: 0.15,
} as const;

export type ScoringWeights = typeof DEFAULT_WEIGHTS;
export type ScoringCategory = keyof ScoringWeights;

// ── Category sub-score result ──────────────────────────────────────────────

export type CategoryResult = {
  category: ScoringCategory;
  rawScore: number; // 0-1 normalized
  weight: number;
  weightedScore: number; // rawScore * weight
  signals: string[]; // human-readable signals that influenced this score
};

// ── Risk penalty ───────────────────────────────────────────────────────────

export type RiskPenalty = {
  flag: string;
  multiplier: number; // 0-1, applied multiplicatively to final score
  description: string;
};

// ── Engine output ──────────────────────────────────────────────────────────

export type ScoringEngineResult = {
  score: number; // 0-100 integer
  priorityTier: 'hot' | 'warm' | 'cold' | 'unqualified';
  confidence: number; // 0-1 based on data completeness
  categories: CategoryResult[];
  riskPenalties: RiskPenalty[];
  strengths: string[];
  weaknesses: string[];
  riskFlags: string[];
  missingInformation: string[];
  dataCompleteness: number; // 0-1
};

// ── Range string parser ───────────────────────────────────────────────

/**
 * Parse a budget/income range string (e.g. "$1,500 - $2,000", "Under $1,500",
 * "$5,000+") into a numeric midpoint. Returns null if unparseable.
 */
export function parseRangeMidpoint(range: string): number | null {
  if (!range) return null;
  if (range.includes('+')) {
    const num = parseInt(range.replace(/[^0-9]/g, ''));
    return num || null;
  }
  if (range.toLowerCase().includes('under')) {
    const num = parseInt(range.replace(/[^0-9]/g, ''));
    return num ? num * 0.75 : null;
  }
  const nums = range.match(/[\d,]+/g)?.map(n => parseInt(n.replace(/,/g, ''))) || [];
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  if (nums.length === 1) return nums[0];
  return null;
}

/**
 * Resolve a value that may be a number or range string into a number.
 */
function resolveNumericValue(value: number | string | undefined | null): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return parseRangeMidpoint(value) ?? 0;
}

// ── Tier thresholds ────────────────────────────────────────────────────────

const TIER_THRESHOLDS = {
  hot: 75,
  warm: 45,
  cold: 20,
} as const;

function assignTier(score: number): ScoringEngineResult['priorityTier'] {
  if (score >= TIER_THRESHOLDS.hot) return 'hot';
  if (score >= TIER_THRESHOLDS.warm) return 'warm';
  if (score >= TIER_THRESHOLDS.cold) return 'cold';
  return 'unqualified';
}

// ── Scoring input ──────────────────────────────────────────────────────────

export type ScoringInput = {
  name: string;
  email: string | null;
  phone: string;
  budget: number | null;
  applicationData: ApplicationData | null;
  leadType?: 'rental' | 'buyer';
};

// ═══════════════════════════════════════════════════════════════════════════
// Category scoring functions — each returns 0-1
// ═══════════════════════════════════════════════════════════════════════════

// Credit score is NOT collected on the intake form — this returns a neutral score.
// Kept as a stub for type compatibility; not included in rental weight calculations.
function scoreCreditScore(_input: ScoringInput): CategoryResult {
  return {
    category: 'affordability' as ScoringCategory, // placeholder category
    rawScore: 1.0,
    weight: 0,
    weightedScore: 0,
    signals: ['Credit score not collected — neutral'],
  };
}

/**
 * Parse the form's range-value strings into midpoint numbers.
 * Handles: 'under_1500', '1500_2000', '3500_plus', '6000_plus', etc.
 */
function parseFormRange(value: string | number | undefined | null): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;

  const v = value.toLowerCase().trim();

  // "under_X" → 75% of X
  const underMatch = v.match(/^under[_\s](\d+)/);
  if (underMatch) return parseInt(underMatch[1], 10) * 0.75;

  // "X_plus" or "Xk_plus" → X * 1.25 (conservative upward estimate)
  const plusMatch = v.match(/^(\d+)(?:k)?[_\s]?plus$/);
  if (plusMatch) {
    const num = parseInt(plusMatch[1], 10);
    return (num < 100 ? num * 1000 : num) * 1.25;
  }

  // "X_Y" range → midpoint
  const rangeMatch = v.match(/^(\d+)(?:k)?[_\s](\d+)(?:k)?$/);
  if (rangeMatch) {
    let low = parseInt(rangeMatch[1], 10);
    let high = parseInt(rangeMatch[2], 10);
    // Handle shorthand like '200k_350k' vs '1500_2000'
    if (low < 100) low *= 1000;
    if (high < 100) high *= 1000;
    return (low + high) / 2;
  }

  // Fallback to existing parser for formatted strings like "$1,500 - $2,000"
  return parseRangeMidpoint(value) ?? 0;
}

function scoreAffordability(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.3; // baseline for minimal data

  const income = parseFormRange(app?.monthlyGrossIncome);
  const rent = parseFormRange(app?.monthlyRent) || (input.budget ?? 0);

  if (income > 0 && rent > 0) {
    const ratio = income / rent;

    if (ratio >= 4.0) {
      rawScore = 1.0;
      signals.push(`Strong income-to-rent ratio: ${ratio.toFixed(1)}x (≥4x target rent)`);
    } else if (ratio >= 3.0) {
      rawScore = 0.85;
      signals.push(`Meets 3x rent rule: ${ratio.toFixed(1)}x`);
    } else if (ratio >= 2.5) {
      rawScore = 0.6;
      signals.push(`Below 3x rent rule: ${ratio.toFixed(1)}x — marginal affordability`);
    } else if (ratio >= 2.0) {
      rawScore = 0.35;
      signals.push(`Significantly below 3x: ${ratio.toFixed(1)}x — high rent burden`);
    } else {
      rawScore = 0.1;
      signals.push(`Income-to-rent ratio ${ratio.toFixed(1)}x — likely unaffordable`);
    }
  } else if (income > 0) {
    rawScore = 0.5;
    signals.push(`Income reported but no target rent provided`);
  } else if (rent > 0) {
    rawScore = 0.25;
    signals.push(`Target rent provided but no income reported`);
  } else {
    rawScore = 0.15;
    signals.push('No income or rent data provided');
  }

  return {
    category: 'affordability',
    rawScore,
    weight: DEFAULT_WEIGHTS.affordability,
    weightedScore: rawScore * DEFAULT_WEIGHTS.affordability,
    signals,
  };
}

function scoreMoveInUrgency(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.3;

  if (app?.targetMoveInDate) {
    const moveIn = app.targetMoveInDate.toLowerCase().trim();

    if (moveIn === 'asap') {
      rawScore = 1.0;
      signals.push('Immediate move-in: ASAP');
    } else if (moveIn === '30days') {
      rawScore = 0.85;
      signals.push('Near-term: within 30 days');
    } else if (moveIn === '1-2months') {
      rawScore = 0.6;
      signals.push('Medium-term: 1-2 months');
    } else if (moveIn === 'browsing') {
      rawScore = 0.15;
      signals.push('Just browsing — low urgency');
    } else {
      // Fallback: try parsing as a date for legacy data
      const target = new Date(app.targetMoveInDate);
      if (!isNaN(target.getTime())) {
        const now = new Date();
        const daysUntilMove = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilMove <= 0) {
          rawScore = 0.95;
          signals.push('Immediate move-in needed (date has passed or is today)');
        } else if (daysUntilMove <= 14) {
          rawScore = 1.0;
          signals.push(`Urgent: moving in ${daysUntilMove} days`);
        } else if (daysUntilMove <= 30) {
          rawScore = 0.85;
          signals.push(`Near-term: moving in ${daysUntilMove} days (~1 month)`);
        } else if (daysUntilMove <= 60) {
          rawScore = 0.65;
          signals.push(`Medium-term: moving in ${daysUntilMove} days (~2 months)`);
        } else {
          rawScore = 0.25;
          signals.push(`Far out: moving in ${daysUntilMove} days`);
        }
      } else {
        rawScore = 0.4;
        signals.push(`Move-in timing: "${app.targetMoveInDate}"`);
      }
    }
  } else {
    signals.push('No move-in date provided');
  }

  return {
    category: 'moveInUrgency',
    rawScore,
    weight: DEFAULT_WEIGHTS.moveInUrgency,
    weightedScore: rawScore * DEFAULT_WEIGHTS.moveInUrgency,
    signals,
  };
}

function scoreEmploymentStability(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.2;

  if (app?.employmentStatus) {
    const status = app.employmentStatus.toLowerCase().trim();
    switch (status) {
      case 'full-time':
        rawScore = 1.0;
        signals.push('Full-time employed');
        break;
      case 'self-employed':
        rawScore = 0.75;
        signals.push('Self-employed');
        break;
      case 'part-time':
        rawScore = 0.6;
        signals.push('Part-time employed');
        break;
      case 'student':
        rawScore = 0.4;
        signals.push('Student — may need co-signer or guarantor');
        break;
      case 'not-employed':
        rawScore = 0.15;
        signals.push('Not currently employed — verify alternative income sources');
        break;
      default:
        rawScore = 0.3;
        signals.push(`Employment status: ${app.employmentStatus}`);
    }
  } else {
    signals.push('Employment status not provided');
  }

  return {
    category: 'employmentStability',
    rawScore,
    weight: DEFAULT_WEIGHTS.employmentStability,
    weightedScore: rawScore * DEFAULT_WEIGHTS.employmentStability,
    signals,
  };
}

// Rental history (landlord refs, late payments, lease violations) is NOT collected on the intake form.
// Returns neutral score — not included in rental weight calculations.
function scoreRentalHistory(_input: ScoringInput): CategoryResult {
  return {
    category: 'affordability' as ScoringCategory, // placeholder
    rawScore: 1.0,
    weight: 0,
    weightedScore: 0,
    signals: ['Rental history not collected — neutral'],
  };
}

function scoreApplicationCompleteness(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];

  if (!app) {
    return {
      category: 'applicationCompleteness',
      rawScore: 0.1,
      weight: DEFAULT_WEIGHTS.applicationCompleteness,
      weightedScore: 0.1 * DEFAULT_WEIGHTS.applicationCompleteness,
      signals: ['No application data — basic contact info only'],
    };
  }

  // Only check fields that the rental intake form ACTUALLY collects
  const fields = [
    input.name,                // legalName
    input.email,               // email
    input.phone,               // phone
    app.targetMoveInDate,
    app.propertyAddress,
    app.monthlyRent,
    app.monthlyGrossIncome,
    app.employmentStatus,
    app.numberOfOccupants,
    app.hasPets,
    app.leaseTermPreference,
  ];

  const totalFields = fields.length;
  const filled = fields.filter((v) => v != null && v !== '').length;
  const completeness = filled / totalFields;

  let rawScore: number;
  if (completeness >= 0.9) {
    rawScore = 1.0;
    signals.push(`Excellent: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  } else if (completeness >= 0.7) {
    rawScore = 0.75;
    signals.push(`Good: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  } else if (completeness >= 0.5) {
    rawScore = 0.5;
    signals.push(`Partial: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  } else {
    rawScore = 0.2;
    signals.push(`Incomplete: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  }

  return {
    category: 'applicationCompleteness',
    rawScore,
    weight: DEFAULT_WEIGHTS.applicationCompleteness,
    weightedScore: rawScore * DEFAULT_WEIGHTS.applicationCompleteness,
    signals,
  };
}

function scoreHouseholdFit(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.5; // neutral

  if (!app) {
    return {
      category: 'householdFit',
      rawScore: 0.4,
      weight: DEFAULT_WEIGHTS.householdFit,
      weightedScore: 0.4 * DEFAULT_WEIGHTS.householdFit,
      signals: ['No household data provided'],
    };
  }

  const occupants = app.numberOfOccupants;

  if (occupants != null && occupants > 0) {
    signals.push(`Total occupants: ${occupants}`);
    if (occupants <= 2) {
      rawScore = 0.9;
      signals.push('Small household — fits most unit types');
    } else if (occupants <= 4) {
      rawScore = 0.7;
      signals.push('Medium household — verify unit size compatibility');
    } else {
      rawScore = 0.4;
      signals.push('Large household — may need specific unit type');
    }
  } else {
    signals.push('Number of occupants not provided');
  }

  if (app.hasPets === true) {
    rawScore = Math.max(0, rawScore - 0.1);
    signals.push('Has pets — verify pet policy');
  } else if (app.hasPets === false) {
    signals.push('No pets');
  }

  return {
    category: 'householdFit',
    rawScore: Math.max(0, Math.min(1.0, rawScore)),
    weight: DEFAULT_WEIGHTS.householdFit,
    weightedScore: Math.max(0, Math.min(1.0, rawScore)) * DEFAULT_WEIGHTS.householdFit,
    signals,
  };
}

// Screening flags (evictions, bankruptcy, outstanding balances) are NOT collected on the intake form.
// Returns neutral score — not included in rental weight calculations.
function scoreScreeningFlags(_input: ScoringInput): CategoryResult {
  return {
    category: 'affordability' as ScoringCategory, // placeholder
    rawScore: 1.0,
    weight: 0,
    weightedScore: 0,
    signals: ['Screening flags not collected — neutral'],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Risk penalties — multiplicative post-processing
// ═══════════════════════════════════════════════════════════════════════════

function computeRiskPenalties(input: ScoringInput): RiskPenalty[] {
  const app = input.applicationData;
  const penalties: RiskPenalty[] = [];

  if (!app) return penalties;

  // Income way below threshold (using form range values)
  const income = parseFormRange(app.monthlyGrossIncome);
  const rent = parseFormRange(app.monthlyRent);
  if (income > 0 && rent > 0 && income / rent < 1.5) {
    penalties.push({
      flag: 'severe_affordability_gap',
      multiplier: 0.6,
      description: `Income-to-rent ratio below 1.5x — severe affordability risk`,
    });
  }

  return penalties;
}

// ═══════════════════════════════════════════════════════════════════════════
// Data completeness & confidence
// ═══════════════════════════════════════════════════════════════════════════

function computeDataCompleteness(input: ScoringInput): number {
  const app = input.applicationData;
  if (!app) return 0.1;

  if (input.leadType === 'buyer') {
    return computeBuyerDataCompleteness(input);
  }

  // Rental lead: only check fields the intake form actually collects
  const fields = [
    input.name,                // legalName
    input.email,               // email
    input.phone,               // phone
    app.targetMoveInDate,
    app.propertyAddress,
    app.monthlyRent,
    app.monthlyGrossIncome,
    app.employmentStatus,
    app.numberOfOccupants,
    app.hasPets,
    app.leaseTermPreference,
  ];

  const filled = fields.filter((v) => v != null && v !== '').length;
  return Math.min(1.0, filled / fields.length);
}

function computeBuyerDataCompleteness(input: ScoringInput): number {
  const app = input.applicationData;
  if (!app) return 0.1;

  // Only check fields the buyer intake form actually collects
  const fields = [
    input.name,                                    // legalName
    input.email,                                   // email
    input.phone,                                   // phone
    app.buyerBudget,
    app.preApprovalStatus,
    app.propertyType,
    app.bedrooms,
    app.bathrooms,
    app.mustHaves,
    app.buyerTimeline || app.targetMoveInDate,
    app.housingSituation || app.currentHousingStatus,
    app.firstTimeBuyer,
  ];

  const filled = fields.filter((v) => v != null && v !== '').length;
  return Math.min(1.0, filled / fields.length);
}

// ═══════════════════════════════════════════════════════════════════════════
// Collect strengths, weaknesses, risk flags, missing info
// ═══════════════════════════════════════════════════════════════════════════

function collectInsights(categories: CategoryResult[], penalties: RiskPenalty[], input: ScoringInput) {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const riskFlags: string[] = [];
  const missingInformation: string[] = [];
  const app = input.applicationData;

  for (const cat of categories) {
    if (cat.rawScore >= 0.8) {
      const topSignal = cat.signals[0];
      if (topSignal) strengths.push(topSignal);
    }
    if (cat.rawScore <= 0.35) {
      const topSignal = cat.signals[0];
      if (topSignal) weaknesses.push(topSignal);
    }
  }

  for (const penalty of penalties) {
    riskFlags.push(penalty.description);
  }

  // Check for specific screening flags from category signals
  for (const cat of categories) {
    for (const sig of cat.signals) {
      if (sig.startsWith('CRITICAL:') || sig.startsWith('WARNING:')) {
        if (!riskFlags.includes(sig)) riskFlags.push(sig);
      }
    }
  }

  // Missing information — only flag fields the intake form actually collects
  if (!app) {
    missingInformation.push('Full application data');
  } else if (input.leadType === 'buyer') {
    if (!app.preApprovalStatus) missingInformation.push('Pre-approval status');
    if (!app.buyerBudget) missingInformation.push('Buyer budget');
    if (!app.buyerTimeline && !app.targetMoveInDate) missingInformation.push('Purchase timeline');
    if (!app.housingSituation && !app.currentHousingStatus) missingInformation.push('Current housing situation');
    if (!app.propertyType) missingInformation.push('Desired property type');
    if (!app.firstTimeBuyer) missingInformation.push('First-time buyer status');
    if (!app.bedrooms) missingInformation.push('Bedroom preferences');
    if (!app.bathrooms) missingInformation.push('Bathroom preferences');
  } else {
    // Rental — only flag fields the rental form collects
    if (!app.monthlyGrossIncome) missingInformation.push('Monthly gross income');
    if (!app.employmentStatus) missingInformation.push('Employment status');
    if (!app.targetMoveInDate) missingInformation.push('Target move-in date');
    if (!app.monthlyRent && !input.budget) missingInformation.push('Target monthly rent');
    if (!app.propertyAddress) missingInformation.push('Property address');
    if (app.numberOfOccupants == null) missingInformation.push('Number of occupants');
    if (app.hasPets == null) missingInformation.push('Pet information');
    if (!app.leaseTermPreference) missingInformation.push('Lease term preference');
  }

  return {
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    riskFlags: riskFlags.slice(0, 5),
    missingInformation: missingInformation.slice(0, 5),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Buyer scoring weights — must sum to 1.0
// ═══════════════════════════════════════════════════════════════════════════

export const BUYER_WEIGHTS = {
  preApproval: 0.30,
  budgetAlignment: 0.20,
  timelineUrgency: 0.15,
  propertySpecificity: 0.15,
  housingSituation: 0.10,
  completeness: 0.10,
} as const;

export type BuyerScoringCategory = keyof typeof BUYER_WEIGHTS;

// ── Buyer category scoring functions ─────────────────────────────────────

function scoreBuyerPreApproval(input: ScoringInput): { rawScore: number; signals: string[] } {
  const app = input.applicationData;
  const status = app?.preApprovalStatus;
  const signals: string[] = [];
  let rawScore = 0.2;

  if (status === 'yes') {
    rawScore = 1.0;
    signals.push('Pre-approved for mortgage');
    if (app?.preApprovalLender) {
      signals.push(`Lender: ${app.preApprovalLender}`);
    }
    if (app?.preApprovalAmount) {
      signals.push(`Pre-approval amount: ${app.preApprovalAmount}`);
    }
  } else if (status === 'not-yet') {
    rawScore = 0.5;
    signals.push('Not yet pre-approved — in progress');
  } else if (status === 'no') {
    rawScore = 0.2;
    signals.push('No pre-approval — early stage buyer');
  } else {
    signals.push('Pre-approval status not provided');
  }

  return { rawScore, signals };
}

function scoreBuyerBudgetAlignment(input: ScoringInput): { rawScore: number; signals: string[] } {
  const app = input.applicationData;
  const signals: string[] = [];

  const budget = parseFormRange(app?.buyerBudget) || (input.budget ?? 0);

  if (budget <= 0) {
    signals.push('No buyer budget provided');
    return { rawScore: 0.2, signals };
  }

  let rawScore: number;
  if (budget >= 500000) {
    rawScore = 1.0;
    signals.push(`High budget: $${budget.toLocaleString()} — strong purchasing power`);
  } else if (budget >= 350000) {
    rawScore = 0.85;
    signals.push(`Good budget: $${budget.toLocaleString()}`);
  } else if (budget >= 200000) {
    rawScore = 0.6;
    signals.push(`Moderate budget: $${budget.toLocaleString()}`);
  } else if (budget >= 100000) {
    rawScore = 0.35;
    signals.push(`Lower budget: $${budget.toLocaleString()} — limited inventory`);
  } else {
    rawScore = 0.15;
    signals.push(`Very low budget: $${budget.toLocaleString()} — may be unrealistic in most markets`);
  }

  return { rawScore, signals };
}

function scoreBuyerTimeline(input: ScoringInput): { rawScore: number; signals: string[] } {
  const app = input.applicationData;
  const signals: string[] = [];
  const timeline = app?.buyerTimeline || app?.targetMoveInDate;

  if (!timeline) {
    signals.push('No purchase timeline provided');
    return { rawScore: 0.3, signals };
  }

  const lower = timeline.toLowerCase();
  let rawScore: number;

  if (lower === 'asap' || lower.includes('immediate')) {
    rawScore = 1.0;
    signals.push('ASAP timeline — ready to buy now');
  } else if (lower === '1-3months' || lower === '1-3mo' || lower.includes('1-3') || lower.includes('1–3')) {
    rawScore = 0.8;
    signals.push('1-3 month timeline — actively searching');
  } else if (lower === '3-6months' || lower === '3-6mo' || lower.includes('3-6') || lower.includes('3–6')) {
    rawScore = 0.5;
    signals.push('3-6 month timeline — planning phase');
  } else if (lower === 'exploring' || lower.includes('browsing') || lower.includes('just looking')) {
    rawScore = 0.15;
    signals.push('Exploring — no firm timeline');
  } else {
    rawScore = 0.4;
    signals.push(`Purchase timeline: "${timeline}"`);
  }

  return { rawScore, signals };
}

function scoreBuyerHousingSituation(input: ScoringInput): { rawScore: number; signals: string[] } {
  const app = input.applicationData;
  const signals: string[] = [];
  const situation = app?.housingSituation || app?.currentHousingStatus;

  if (!situation) {
    signals.push('Current housing situation not provided');
    return { rawScore: 0.5, signals };
  }

  const lower = situation.toLowerCase();
  let rawScore: number;

  if (lower === 'renting' || lower === 'rent') {
    rawScore = 0.9;
    signals.push('Currently renting — motivated to buy');
  } else if (lower === 'family' || lower === 'rent-free') {
    rawScore = 0.8;
    signals.push('Living with family — motivated to move');
  } else if (lower === 'own-home' || lower === 'own') {
    rawScore = 0.6;
    signals.push('Currently owns home — upgrading or relocating');
  } else {
    rawScore = 0.5;
    signals.push(`Housing situation: "${situation}"`);
  }

  return { rawScore, signals };
}

function scoreBuyerFirstTime(input: ScoringInput): { rawScore: number; signals: string[] } {
  const app = input.applicationData;
  const signals: string[] = [];
  const firstTime = app?.firstTimeBuyer;

  if (!firstTime) {
    signals.push('First-time buyer status not provided');
    return { rawScore: 0.5, signals };
  }

  let rawScore: number;

  if (firstTime === 'yes') {
    rawScore = 0.7;
    signals.push('First-time buyer — eager but may need more guidance');
  } else {
    rawScore = 0.9;
    signals.push('Experienced buyer — knows the process');
  }

  return { rawScore, signals };
}

function scoreBuyerPropertySpecificity(input: ScoringInput): { rawScore: number; signals: string[] } {
  const app = input.applicationData;
  const signals: string[] = [];
  let specificityPoints = 0;
  const maxPoints = 5;

  if (app?.propertyType) {
    specificityPoints++;
    signals.push(`Property type: ${app.propertyType}`);
  }

  if (app?.bedrooms) {
    specificityPoints++;
    signals.push(`Bedrooms: ${app.bedrooms}`);
  }

  if (app?.bathrooms) {
    specificityPoints++;
    signals.push(`Bathrooms: ${app.bathrooms}`);
  }

  const mustHaves = app?.mustHaves;
  if (mustHaves) {
    const items = Array.isArray(mustHaves)
      ? mustHaves
      : mustHaves.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (items.length > 0) {
      specificityPoints += Math.min(2, items.length); // up to 2 points for must-haves
      signals.push(`Must-haves: ${items.join(', ')}`);
    }
  }

  if (specificityPoints === 0) {
    signals.push('No property preferences specified');
  }

  const rawScore = Math.min(1.0, specificityPoints / maxPoints);
  return { rawScore, signals };
}

function scoreBuyerCompleteness(input: ScoringInput): { rawScore: number; signals: string[]; completeness: number } {
  const app = input.applicationData;
  const signals: string[] = [];

  if (!app) {
    return {
      rawScore: 0.1,
      signals: ['No application data — basic contact info only'],
      completeness: 0.1,
    };
  }

  const fields = [
    input.name,
    input.email,
    input.phone,
    app.buyerBudget,
    app.preApprovalStatus,
    app.propertyType,
    app.bedrooms,
    app.bathrooms,
    app.mustHaves,
    app.buyerTimeline || app.targetMoveInDate,
    app.housingSituation || app.currentHousingStatus,
    app.firstTimeBuyer,
  ];

  const totalFields = fields.length;
  const filled = fields.filter((v) => v != null && v !== '').length;
  const completeness = filled / totalFields;

  let rawScore: number;
  if (completeness >= 0.9) {
    rawScore = 1.0;
    signals.push(`Excellent: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  } else if (completeness >= 0.7) {
    rawScore = 0.75;
    signals.push(`Good: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  } else if (completeness >= 0.5) {
    rawScore = 0.5;
    signals.push(`Partial: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  } else {
    rawScore = 0.2;
    signals.push(`Incomplete: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  }

  return { rawScore, signals, completeness };
}

// ── Buyer risk penalties ──────────────────────────────────────────────────

function computeBuyerRiskPenalties(input: ScoringInput): RiskPenalty[] {
  const app = input.applicationData;
  const penalties: RiskPenalty[] = [];

  if (!app) return penalties;

  // No pre-approval + ASAP timeline = risky
  const timeline = (app.buyerTimeline || app.targetMoveInDate || '').toLowerCase();
  const isAsap = timeline === 'asap' || timeline.includes('immediate');

  if (app.preApprovalStatus !== 'yes' && isAsap) {
    penalties.push({
      flag: 'no_preapproval_urgent_timeline',
      multiplier: 0.8,
      description: 'No pre-approval with ASAP timeline — buyer may not be financially ready',
    });
  }

  // Budget under $200K in expensive markets = cold signal
  const budget = parseFormRange(app.buyerBudget) || (input.budget ?? 0);
  if (budget > 0 && budget < 200000) {
    penalties.push({
      flag: 'low_budget_market',
      multiplier: 0.85,
      description: `Budget $${budget.toLocaleString()} under $200K — limited options in most markets`,
    });
  }

  return penalties;
}

// ── Buyer insights ────────────────────────────────────────────────────────

function collectBuyerInsights(
  categoryResults: { name: string; rawScore: number; signals: string[] }[],
  penalties: RiskPenalty[],
  input: ScoringInput,
) {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const riskFlags: string[] = [];
  const missingInformation: string[] = [];
  const app = input.applicationData;

  for (const cat of categoryResults) {
    if (cat.rawScore >= 0.8) {
      const topSignal = cat.signals[0];
      if (topSignal) strengths.push(topSignal);
    }
    if (cat.rawScore <= 0.35) {
      const topSignal = cat.signals[0];
      if (topSignal) weaknesses.push(topSignal);
    }
  }

  for (const penalty of penalties) {
    riskFlags.push(penalty.description);
  }

  // Missing information — only flag fields the buyer form actually collects
  if (!app) {
    missingInformation.push('Full application data');
  } else {
    if (!app.preApprovalStatus) missingInformation.push('Pre-approval status');
    if (!app.buyerBudget) missingInformation.push('Buyer budget');
    if (!app.buyerTimeline && !app.targetMoveInDate) missingInformation.push('Purchase timeline');
    if (!app.housingSituation && !app.currentHousingStatus) missingInformation.push('Current housing situation');
    if (!app.firstTimeBuyer) missingInformation.push('First-time buyer status');
    if (!app.propertyType) missingInformation.push('Desired property type');
    if (!app.bedrooms) missingInformation.push('Bedroom preferences');
    if (!app.bathrooms) missingInformation.push('Bathroom preferences');
    if (!app.mustHaves) missingInformation.push('Must-have features');
  }

  return {
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    riskFlags: riskFlags.slice(0, 5),
    missingInformation: missingInformation.slice(0, 5),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Buyer scoring — main function
// ═══════════════════════════════════════════════════════════════════════════

function computeBuyerScore(input: ScoringInput): ScoringEngineResult {
  // 1. Compute all buyer category sub-scores
  const preApproval = scoreBuyerPreApproval(input);
  const budgetAlignment = scoreBuyerBudgetAlignment(input);
  const timeline = scoreBuyerTimeline(input);
  const specificity = scoreBuyerPropertySpecificity(input);
  const housing = scoreBuyerHousingSituation(input);
  const completenessResult = scoreBuyerCompleteness(input);

  const buyerCategories = [
    { name: 'preApproval', ...preApproval },
    { name: 'budgetAlignment', ...budgetAlignment },
    { name: 'timelineUrgency', ...timeline },
    { name: 'propertySpecificity', ...specificity },
    { name: 'housingSituation', ...housing },
    { name: 'completeness', ...completenessResult },
  ];

  // 2. Map to CategoryResult[] for compatibility with existing types
  const categoryMapping: ScoringCategory[] = [
    'affordability',           // preApproval
    'employmentStability',     // budgetAlignment
    'moveInUrgency',           // timelineUrgency
    'applicationCompleteness', // propertySpecificity
    'householdFit',            // housingSituation
    'affordability',           // completeness (reuse placeholder)
  ];

  const categories: CategoryResult[] = buyerCategories.map((cat, i) => {
    const mappedCategory = categoryMapping[i];
    const weight = Object.values(BUYER_WEIGHTS)[i];
    return {
      category: mappedCategory,
      rawScore: cat.rawScore,
      weight,
      weightedScore: cat.rawScore * weight,
      signals: [`[${cat.name}] `, ...cat.signals],
    };
  });

  // 3. Sum weighted scores -> base score 0-1
  let baseScore = categories.reduce((sum, cat) => sum + cat.weightedScore, 0);

  // 4. Apply buyer risk penalties
  const riskPenalties = computeBuyerRiskPenalties(input);
  for (const penalty of riskPenalties) {
    baseScore *= penalty.multiplier;
  }

  // 5. Scale to 0-100 and clamp
  const finalScore = Math.max(0, Math.min(100, Math.round(baseScore * 100)));

  // 6. Confidence from data completeness
  const dataCompleteness = completenessResult.completeness;
  const confidence = Math.round(dataCompleteness * 100) / 100;

  // 7. Collect insights
  const { strengths, weaknesses, riskFlags, missingInformation } = collectBuyerInsights(
    buyerCategories,
    riskPenalties,
    input,
  );

  return {
    score: finalScore,
    priorityTier: assignTier(finalScore),
    confidence,
    categories,
    riskPenalties,
    strengths,
    weaknesses,
    riskFlags,
    missingInformation,
    dataCompleteness,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main scoring function (rental — default path)
// ═══════════════════════════════════════════════════════════════════════════

export function computeLeadScore(input: ScoringInput): ScoringEngineResult {
  if (input.leadType === 'buyer') {
    return computeBuyerScore(input);
  }

  // 1. Compute all category sub-scores (only categories with collected data)
  const categories: CategoryResult[] = [
    scoreAffordability(input),
    scoreEmploymentStability(input),
    scoreMoveInUrgency(input),
    scoreApplicationCompleteness(input),
    scoreHouseholdFit(input),
  ];

  // 2. Sum weighted scores → base score 0-1
  let baseScore = categories.reduce((sum, cat) => sum + cat.weightedScore, 0);

  // 3. Apply risk penalties multiplicatively
  const riskPenalties = computeRiskPenalties(input);
  for (const penalty of riskPenalties) {
    baseScore *= penalty.multiplier;
  }

  // 3b. Intent signal from lease term preference
  const intent = input.applicationData?.leaseTermPreference;
  if (intent === 'ready') {
    baseScore = Math.min(1.0, baseScore + 0.05); // hot signal boost
  } else if (intent === 'exploring') {
    baseScore *= 0.9; // slight dampening for exploratory leads
  }

  // 4. Scale to 0-100 and clamp
  const finalScore = Math.max(0, Math.min(100, Math.round(baseScore * 100)));

  // 5. Compute confidence from data completeness
  const dataCompleteness = computeDataCompleteness(input);
  const confidence = Math.round(dataCompleteness * 100) / 100;

  // 6. Collect human-readable insights
  const { strengths, weaknesses, riskFlags, missingInformation } = collectInsights(
    categories,
    riskPenalties,
    input,
  );

  return {
    score: finalScore,
    priorityTier: assignTier(finalScore),
    confidence,
    categories,
    riskPenalties,
    strengths,
    weaknesses,
    riskFlags,
    missingInformation,
    dataCompleteness,
  };
}
