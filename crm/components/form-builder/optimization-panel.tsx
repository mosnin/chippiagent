'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Lightbulb,
  RefreshCw,
  Loader2,
  X,
  ArrowUp,
  Trash2,
  Pencil,
  Plus,
  BarChart3,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { H2, TITLE_FONT, SECTION_LABEL, STAT_NUMBER_COMPACT, BODY_MUTED } from '@/lib/typography';

// ── Types (mirror server types) ──────────────────────────────────────────────

interface FormSuggestion {
  type: 'reorder' | 'remove' | 'modify' | 'add' | 'scoring';
  target: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  reasoning: string;
  source?: 'data' | 'ai';
}

interface ScoreDistribution {
  hot: number;
  warm: number;
  cold: number;
}

interface FormPerformance {
  totalSubmissions: number;
  avgLeadScore: number;
  scoreDistribution: ScoreDistribution;
  mostCommonDropOff: string | null;
}

interface OptimizationResult {
  performance: FormPerformance;
  suggestions: FormSuggestion[];
  generatedAt: string;
  message?: string;
}

// ── Style maps ───────────────────────────────────────────────────────────────

/**
 * Severity dot tone (sanctioned subtle).
 * Severity is the message — the rest of the row stays paper-flat.
 */
const IMPACT_DOT: Record<string, string> = {
  high: 'bg-rose-500/70',
  medium: 'bg-amber-500/70',
  low: 'bg-muted-foreground/40',
};

const IMPACT_LABEL: Record<string, string> = {
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Low impact',
};

const TYPE_LABELS: Record<string, string> = {
  reorder: 'Reorder',
  remove: 'Remove',
  modify: 'Edit',
  add: 'Add',
  scoring: 'Scoring',
};

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  reorder: ArrowUp,
  remove: Trash2,
  modify: Pencil,
  add: Plus,
  scoring: BarChart3,
};

const LOADING_STEPS = [
  'Gathering your submission data…',
  'Analyzing answer patterns across questions…',
  'Identifying drop-off points…',
  'Generating personalized suggestions…',
];

// ── Subtle pill ──────────────────────────────────────────────────────────────

function MutedPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-muted-foreground bg-foreground/[0.06] rounded px-1.5 py-0.5 text-[10px] font-mono',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────

function PrimaryButton({
  onClick,
  disabled,
  children,
  className,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-sm font-medium',
        'hover:bg-foreground/90 active:scale-[0.98] transition-all duration-150',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        className,
      )}
    >
      {children}
    </button>
  );
}

function GhostButton({
  onClick,
  disabled,
  children,
  className,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm text-muted-foreground',
        'hover:bg-foreground/[0.04] hover:text-foreground transition-colors duration-150',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ── Suggestion row ───────────────────────────────────────────────────────────

function SuggestionRow({
  suggestion,
  onDismiss,
}: {
  suggestion: FormSuggestion;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[suggestion.type] ?? Lightbulb;
  const isAI = suggestion.source === 'ai';
  const dotTone = IMPACT_DOT[suggestion.impact] ?? IMPACT_DOT.low;
  const impactLabel = IMPACT_LABEL[suggestion.impact] ?? IMPACT_LABEL.low;

  return (
    <div className="px-4 py-3 hover:bg-foreground/[0.04] transition-colors duration-150">
      <div className="flex items-start gap-3">
        {/* Severity dot — single tinted point, the row body stays paper-flat */}
        <span
          aria-label={impactLabel}
          title={impactLabel}
          className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1.5', dotTone)}
        />

        {/* Type icon, muted */}
        <Icon size={14} className="text-muted-foreground/70 flex-shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <p className="text-sm font-medium text-foreground leading-snug">{suggestion.title}</p>
            <MutedPill>{TYPE_LABELS[suggestion.type] ?? suggestion.type}</MutedPill>
            <MutedPill>
              {isAI ? <MessageCircle size={9} /> : <Database size={9} />}
              {isAI ? 'AI' : 'data'}
            </MutedPill>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.description}</p>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-2 transition-colors duration-150"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Hide details' : 'Why this suggestion?'}
          </button>
          {expanded && (
            <p className="text-[11px] text-muted-foreground mt-1 pl-3.5 border-l border-border/70 leading-relaxed">
              {suggestion.reasoning}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
          aria-label="Dismiss this suggestion"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Performance summary ──────────────────────────────────────────────────────

function PerformanceSummary({ performance }: { performance: FormPerformance }) {
  return (
    <div className="bg-background border border-border/70 rounded-lg px-4 py-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className={SECTION_LABEL}>Submissions</p>
          <p className={cn(STAT_NUMBER_COMPACT, 'mt-0.5')} style={TITLE_FONT}>
            {performance.totalSubmissions}
          </p>
          <p className="text-[10px] text-muted-foreground">last 30 days</p>
        </div>
        <div>
          <p className={SECTION_LABEL}>Avg lead score</p>
          <p className={cn(STAT_NUMBER_COMPACT, 'mt-0.5')} style={TITLE_FONT}>
            {performance.avgLeadScore}
            <span className="text-sm text-muted-foreground"> /100</span>
          </p>
        </div>
        <div>
          <p className={SECTION_LABEL}>Lead quality</p>
          <div className="flex flex-col gap-1 mt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 flex-shrink-0" />
              <span className="text-xs text-foreground">{performance.scoreDistribution.hot}% hot</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70 flex-shrink-0" />
              <span className="text-xs text-foreground">{performance.scoreDistribution.warm}% warm</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
              <span className="text-xs text-foreground">{performance.scoreDistribution.cold}% cold</span>
            </div>
          </div>
        </div>
        {performance.mostCommonDropOff && (
          <div>
            <p className={SECTION_LABEL}>Common drop-off</p>
            <p className="text-xs text-foreground mt-1 truncate" title={performance.mostCommonDropOff}>
              {performance.mostCommonDropOff}
            </p>
            <p className="text-[10px] text-muted-foreground">where applicants stop</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyzingProgress() {
  const [step, setStep] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 2200);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <div className="bg-background border border-border/70 rounded-lg p-8 text-center">
      <Loader2 size={20} className="mx-auto animate-spin text-muted-foreground mb-3" />
      <p className="text-sm text-foreground">Analyzing your form…</p>
      <p className="text-xs text-muted-foreground mt-2 h-4 transition-opacity duration-150">
        {LOADING_STEPS[step]}
      </p>
      <div className="flex justify-center gap-1.5 mt-4">
        {LOADING_STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 rounded-full transition-all duration-150',
              i <= step ? 'w-6 bg-foreground' : 'w-3 bg-foreground/[0.06]',
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export interface OptimizationPanelProps {
  slug: string;
}

function friendlyErrorMessage(raw: string): { title: string; detail: string } {
  const lower = raw.toLowerCase();
  if (lower.includes('rate limit')) {
    return {
      title: 'You have reached the analysis limit',
      detail: 'Five refreshes an hour is the cap. Give it a few minutes and try again.',
    };
  }
  if (lower.includes('openai') || lower.includes('ai') || lower.includes('timeout')) {
    return {
      title: 'Our AI assistant is temporarily unavailable',
      detail: 'The analysis service is busy. Your data-driven suggestions will still appear. Try again in a minute.',
    };
  }
  if (lower.includes('no custom form')) {
    return {
      title: 'No form set up yet',
      detail: 'Switch to Questions to create your intake form before running an analysis.',
    };
  }
  return {
    title: 'Something went wrong',
    detail: raw,
  };
}

export function OptimizationPanel({ slug }: OptimizationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchSuggestions = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/form-config/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, skipCache }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data: OptimizationResult = await res.json();
      setResult(data);
      setDismissedIds(new Set());
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const handleDismiss = useCallback((target: string, type: string) => {
    setDismissedIds((prev) => new Set(prev).add(`${type}:${target}`));
  }, []);

  const visibleSuggestions = result?.suggestions.filter(
    (s) => !dismissedIds.has(`${s.type}:${s.target}`)
  ) ?? [];

  // Initial state
  if (!hasLoaded && !loading && !error) {
    return (
      <div className="bg-background border border-border/70 rounded-lg p-10 text-center max-w-2xl mx-auto">
        <h3 className={cn(H2, 'mb-2')} style={TITLE_FONT}>
          Get suggestions to improve your form
        </h3>
        <p className={cn(BODY_MUTED, 'mb-5 max-w-md mx-auto leading-relaxed')}>
          We&apos;ll review how applicants interact with your form — which questions they skip,
          where they drop off, and how their answers affect lead scores — then recommend
          specific changes to get better results.
        </p>
        <PrimaryButton onClick={() => fetchSuggestions()} disabled={loading} className="mx-auto">
          <Lightbulb size={14} /> Analyze my form
        </PrimaryButton>
        <p className="text-[10px] text-muted-foreground mt-3">
          Works best with at least 10 submissions in the last 30 days.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className={H2} style={TITLE_FONT}>
            Suggestions for your form
          </h3>
          {result?.generatedAt && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Last analyzed {new Date(result.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <GhostButton onClick={() => fetchSuggestions(true)} disabled={loading}>
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Re-analyze
        </GhostButton>
      </div>

      {/* Loading */}
      {loading && <AnalyzingProgress />}

      {/* Error — sanctioned subtle rose, severity is the message */}
      {error && !loading && (() => {
        const { title, detail } = friendlyErrorMessage(error);
        return (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-400">{title}</p>
            <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-0.5">{detail}</p>
            <button
              type="button"
              onClick={() => fetchSuggestions()}
              className="text-xs text-rose-700 dark:text-rose-400 hover:underline mt-2 transition-colors duration-150"
            >
              Try again
            </button>
          </div>
        );
      })()}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Performance summary */}
          <PerformanceSummary performance={result.performance} />

          {/* Message (e.g., not enough data) — sanctioned subtle amber */}
          {result.message && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{result.message}</p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1 leading-relaxed">
                Share your form link with more applicants to collect enough data. Once you reach the threshold, come back here for personalized recommendations.
              </p>
            </div>
          )}

          {/* Suggestions list — hairline-divided rows, paper-flat */}
          {visibleSuggestions.length > 0 ? (
            <div className="bg-background border border-border/70 rounded-lg overflow-hidden divide-y divide-border/70">
              {visibleSuggestions.map((suggestion) => (
                <SuggestionRow
                  key={`${suggestion.type}:${suggestion.target}`}
                  suggestion={suggestion}
                  onDismiss={() => handleDismiss(suggestion.target, suggestion.type)}
                />
              ))}
            </div>
          ) : result.suggestions.length > 0 ? (
            <div className="bg-background border border-border/70 rounded-lg p-6 text-center">
              <p className="text-sm text-muted-foreground">
                All suggestions dismissed. Click <strong className="font-medium text-foreground">Re-analyze</strong> to get fresh recommendations.
              </p>
            </div>
          ) : !result.message ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Your form looks great. No changes needed right now.
              </p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-1">
                Check back after you get more submissions for new insights.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
