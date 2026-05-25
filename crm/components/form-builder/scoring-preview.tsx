'use client';

import { useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Play,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { STAT_NUMBER, TITLE_FONT, SECTION_LABEL } from '@/lib/typography';
import type { IntakeFormConfig, FormQuestion } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

interface ScoreResult {
  scoringStatus: string;
  leadScore: number | null;
  scoreLabel: string;
  scoreSummary: string | null;
  scoreDetails: {
    score: number;
    priorityTier: string;
    confidence: number;
    summary: string;
    explanationTags: string[];
    strengths: string[];
    weaknesses: string[];
    riskFlags: string[];
    missingInformation: string[];
    recommendedNextAction: string;
  } | null;
}

// ── Subtle pill ──────────────────────────────────────────────────────────────

function MutedPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-muted-foreground bg-foreground/[0.06] rounded px-1.5 py-0.5 text-[10px] font-mono',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Score display helpers ────────────────────────────────────────────────────

function ScoreLabel({ label }: { label: string }) {
  return (
    <MutedPill>
      {label.toLowerCase()}
    </MutedPill>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="w-full h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full bg-foreground transition-all duration-150"
        style={{ width: `${Math.max(2, score)}%` }}
      />
    </div>
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

// ── Question input renderer ──────────────────────────────────────────────────

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: FormQuestion;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  switch (question.type) {
    case 'select':
    case 'radio':
      return (
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="w-full bg-background border-border/70 h-9">
            <SelectValue placeholder={question.placeholder || 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {(question.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'multi_select':
      return (
        <div className="flex flex-wrap gap-1.5">
          {(question.options ?? []).map((opt) => {
            const selected = Array.isArray(value) && value.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const current = Array.isArray(value) ? value : [];
                  const next = selected
                    ? current.filter((v) => v !== opt.value)
                    : [...current, opt.value];
                  onChange(next);
                }}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border transition-colors duration-150',
                  selected
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background border-border/70 text-foreground hover:bg-foreground/[0.04]',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );

    case 'textarea':
      return (
        <Textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ''}
          className="min-h-[60px] bg-background border-border/70"
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ''}
          className="bg-background border-border/70 h-9"
        />
      );

    case 'date':
      return (
        <Input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="bg-background border-border/70 h-9"
        />
      );

    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === 'true' || (value as unknown) === true}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            className="rounded border-border/70"
          />
          <span className="text-xs text-muted-foreground">{question.description || 'Yes'}</span>
        </label>
      );

    default:
      return (
        <Input
          type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ''}
          className="bg-background border-border/70 h-9"
        />
      );
  }
}

// ── Detail list (strengths/weaknesses/risk/missing) ─────────────────────────
//
// Severity is the message here, so we use the sanctioned subtle tones
// SPARINGLY: a single tinted dot, with the rest paper-flat. No tinted card
// backgrounds, no colored headings.

type DetailKind = 'positive' | 'warning' | 'critical' | 'neutral';

const DOT_TONE: Record<DetailKind, string> = {
  positive: 'bg-emerald-500/70',
  warning: 'bg-amber-500/70',
  critical: 'bg-rose-500/70',
  neutral: 'bg-muted-foreground/40',
};

function DetailList({
  title,
  items,
  kind,
}: {
  title: string;
  items: string[];
  kind: DetailKind;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={cn(SECTION_LABEL, 'mb-1.5')}>
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed">
            <span
              aria-hidden
              className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5', DOT_TONE[kind])}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export interface ScoringPreviewProps {
  config: IntakeFormConfig;
  slug: string;
}

export function ScoringPreview({ config, slug }: ScoringPreviewProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Evaluate section visibility based on current answers
  const isSectionVisible = useCallback((section: { visibleWhen?: { questionId: string; operator: 'equals' | 'not_equals' | 'contains'; value: string } }) => {
    if (!section.visibleWhen) return true;
    const { questionId, operator, value: targetValue } = section.visibleWhen;
    const currentAnswer = answers[questionId];
    const strAnswer = Array.isArray(currentAnswer) ? currentAnswer.join(',') : (currentAnswer ?? '');
    switch (operator) {
      case 'equals': return strAnswer === targetValue;
      case 'not_equals': return strAnswer !== targetValue;
      case 'contains': return strAnswer.includes(targetValue);
      default: return true;
    }
  }, [answers]);

  // Build list of all questions
  const allQuestions = useMemo(() => {
    const qs: { question: FormQuestion; sectionTitle: string }[] = [];
    for (const section of config.sections) {
      for (const question of section.questions) {
        qs.push({ question, sectionTitle: section.title });
      }
    }
    return qs;
  }, [config]);

  // Visible sections for rendering
  const visibleSections = useMemo(() => {
    return config.sections.filter((s) => isSectionVisible(s));
  }, [config.sections, isSectionVisible]);

  const handleChange = useCallback((questionId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setAnswers({});
    setScoreResult(null);
    setError(null);
  }, []);

  const handleRunScoring = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const formattedAnswers: Record<string, string | string[] | number | boolean> = {};
      for (const [key, val] of Object.entries(answers)) {
        if (val === '' || (Array.isArray(val) && val.length === 0)) continue;
        const question = allQuestions.find((q) => q.question.id === key)?.question;
        if (question?.type === 'number' && typeof val === 'string') {
          formattedAnswers[key] = Number(val) || 0;
        } else if (question?.type === 'checkbox') {
          formattedAnswers[key] = val === 'true';
        } else {
          formattedAnswers[key] = val;
        }
      }

      const res = await fetch('/api/form-config/optimize/score-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          formConfig: config,
          answers: formattedAnswers,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Scoring failed (${res.status})`);
      }

      const data: ScoreResult = await res.json();
      setScoreResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scoring failed.');
    } finally {
      setLoading(false);
    }
  }, [answers, allQuestions, slug, config]);

  // Count filled answers
  const filledCount = Object.values(answers).filter(
    (v) => v !== '' && !(Array.isArray(v) && v.length === 0),
  ).length;

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-background border border-border/70 rounded-lg px-4 py-3">
        <p className="text-sm text-foreground mb-1">Test how your form scores different applicants</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Fill in the fields below as if you were an applicant, then press <strong className="font-medium text-foreground">Score this applicant</strong> to see
          the lead score they would receive. Nothing is saved.
        </p>
      </div>

      {/* Form questions (only from visible sections) */}
      <div className="space-y-6">
        {visibleSections.map((section) => (
          <div key={section.id}>
            <h4 className={cn(SECTION_LABEL, 'mb-3')}>
              {section.title}
            </h4>
            <div className="space-y-4">
              {section.questions.map((question) => (
                <div key={question.id} className="space-y-1.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    {question.label}
                    {question.required && <span className="text-muted-foreground">*</span>}
                    {question.scoring?.weight ? (
                      <MutedPill className="ml-1">
                        weight {question.scoring.weight}/10
                      </MutedPill>
                    ) : null}
                  </Label>
                  <QuestionInput
                    question={question}
                    value={answers[question.id] ?? (question.type === 'multi_select' ? [] : '')}
                    onChange={(val) => handleChange(question.id, val)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <PrimaryButton onClick={handleRunScoring} disabled={loading || filledCount === 0}>
          {loading ? (
            <><Loader2 size={14} className="animate-spin" /> Calculating…</>
          ) : (
            <><Play size={14} /> Score this applicant</>
          )}
        </PrimaryButton>
        <GhostButton onClick={handleReset} disabled={loading}>
          <RotateCcw size={14} /> Clear all
        </GhostButton>
        <span className="text-xs text-muted-foreground ml-auto">
          {filledCount === 0
            ? 'Fill in at least one field to run scoring'
            : `${filledCount} of ${allQuestions.length} fields filled`}
        </span>
      </div>

      {/* Error — sanctioned subtle rose tone, severity is the message */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-400">Could not calculate the score</p>
          <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-0.5">{error}</p>
          <button
            type="button"
            onClick={handleRunScoring}
            className="text-xs text-rose-700 dark:text-rose-400 hover:underline mt-2 transition-colors duration-150"
          >
            Try again
          </button>
        </div>
      )}

      {/* Score result */}
      {scoreResult && scoreResult.scoringStatus === 'scored' && (
        <div className="bg-background border border-border/70 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border/70">
            <p className={SECTION_LABEL}>Scoring result</p>
          </div>
          <div className="p-4 space-y-4">
            {/* Score overview */}
            <div className="flex items-center gap-4">
              <div className="text-center flex-shrink-0">
                <p className={STAT_NUMBER} style={TITLE_FONT}>
                  {scoreResult.leadScore}
                </p>
                <p className="text-[10px] text-muted-foreground">out of 100</p>
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                <ScoreBar score={scoreResult.leadScore ?? 0} />
                <div className="flex items-center gap-2 flex-wrap">
                  <ScoreLabel label={scoreResult.scoreLabel} />
                  {scoreResult.scoreDetails?.confidence != null && (
                    <span className="text-[10px] text-muted-foreground" title="How confident the scoring model is in this result">
                      {Math.round(scoreResult.scoreDetails.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Summary */}
            {scoreResult.scoreSummary && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {scoreResult.scoreSummary}
              </p>
            )}

            {/* Details */}
            {scoreResult.scoreDetails && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-2 border-t border-border/70">
                <DetailList
                  title="Strengths"
                  items={scoreResult.scoreDetails.strengths}
                  kind="positive"
                />
                <DetailList
                  title="Weaknesses"
                  items={scoreResult.scoreDetails.weaknesses}
                  kind="warning"
                />
                <DetailList
                  title="Risk flags"
                  items={scoreResult.scoreDetails.riskFlags}
                  kind="critical"
                />
                <DetailList
                  title="Missing information"
                  items={scoreResult.scoreDetails.missingInformation}
                  kind="neutral"
                />
              </div>
            )}

            {/* Tags */}
            {scoreResult.scoreDetails?.explanationTags && scoreResult.scoreDetails.explanationTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/70">
                {scoreResult.scoreDetails.explanationTags.map((tag, i) => (
                  <MutedPill key={i}>{tag}</MutedPill>
                ))}
              </div>
            )}

            {/* Next action */}
            {scoreResult.scoreDetails?.recommendedNextAction && (
              <div className="rounded-md bg-foreground/[0.04] px-3 py-2">
                <p className={SECTION_LABEL}>Recommended action</p>
                <p className="text-xs text-foreground mt-0.5">{scoreResult.scoreDetails.recommendedNextAction}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Failed result — sanctioned subtle amber */}
      {scoreResult && scoreResult.scoringStatus === 'failed' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Scoring could not be calculated</p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
            This usually means no scoring rules are set up yet. Go to <strong className="font-medium">What makes a good lead</strong> to set
            weights and answer scores. Then come back to test.
          </p>
          <button
            type="button"
            onClick={handleRunScoring}
            className="text-xs text-amber-700 dark:text-amber-400 hover:underline mt-2 transition-colors duration-150"
          >
            Retry scoring
          </button>
        </div>
      )}
    </div>
  );
}
