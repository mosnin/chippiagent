'use client';

import { useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  MessageCircle,
  Save,
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { H2, TITLE_FONT, SECTION_LABEL, BODY_MUTED } from '@/lib/typography';
import type { IntakeFormConfig, FormQuestion } from './types';
import type { ScoringModel, QuestionScoringModel, NumberRange } from '@/lib/scoring/scoring-model-types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScoringTabProps {
  config: IntakeFormConfig;
  slug: string;
  leadType: 'rental' | 'buyer';
  scoringModel: ScoringModel | null;
  onScoringModelChange: (model: ScoringModel) => void;
  onSave: (model: ScoringModel) => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SYSTEM_FIELD_IDS = new Set(['name', 'email', 'phone']);

function isScorableQuestion(q: FormQuestion): boolean {
  if (q.system) return false;
  if (SYSTEM_FIELD_IDS.has(q.id)) return false;
  return true;
}

function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Paper-flat bar fill: foreground color, opacity stepped by weight.
// Higher weight = stronger fill, no hue change.
function weightFillOpacity(weight: number): string {
  if (weight >= 20) return 'opacity-100';
  if (weight >= 10) return 'opacity-80';
  if (weight >= 5) return 'opacity-60';
  return 'opacity-40';
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

// ── Primary action button (locked design language) ──────────────────────────

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

// ── Question Scoring Card ────────────────────────────────────────────────────

function QuestionCard({
  question,
  model,
  enabled,
  onToggle,
  onWeightChange,
  onOptionScoreChange,
  onRangeChange,
  onAddRange,
  onRemoveRange,
}: {
  question: FormQuestion;
  model: QuestionScoringModel | undefined;
  enabled: boolean;
  onToggle: () => void;
  onWeightChange: (delta: number) => void;
  onOptionScoreChange: (optValue: string, score: number) => void;
  onRangeChange: (idx: number, field: keyof NumberRange, value: number | string | null) => void;
  onAddRange: () => void;
  onRemoveRange: (idx: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const weight = model?.weight ?? 0;
  const hasOptions = question.options && question.options.length > 0;
  const hasRanges = model?.ranges && model.ranges.length > 0;
  const showDetails = hasOptions || hasRanges;

  return (
    <div
      className={cn(
        'rounded-lg border border-border/70 bg-background transition-colors duration-150 min-w-0',
        !enabled && 'opacity-60',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          className="flex-shrink-0"
        />

        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium truncate', !enabled && 'text-muted-foreground')}>
            {question.label}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <MutedPill>{question.type}</MutedPill>
            {question.required && <MutedPill>required</MutedPill>}
          </div>
        </div>

        {/* Weight display + controls */}
        {enabled && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onWeightChange(-5)}
              disabled={weight <= 0}
              className="w-7 h-7 rounded-md border border-border/70 flex items-center justify-center text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors duration-150 disabled:opacity-30"
            >
              <Minus size={12} />
            </button>
            <span className="text-sm font-medium tabular-nums text-foreground min-w-[40px] text-center">
              {weight}%
            </span>
            <button
              type="button"
              onClick={() => onWeightChange(5)}
              disabled={weight >= 100}
              className="w-7 h-7 rounded-md border border-border/70 flex items-center justify-center text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors duration-150 disabled:opacity-30"
            >
              <Plus size={12} />
            </button>
          </div>
        )}

        {/* Expand toggle for details */}
        {enabled && showDetails && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {/* Weight bar — paper-flat: foreground fill on muted track */}
      {enabled && (
        <div className="px-4 pb-3">
          <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full bg-foreground transition-all duration-150',
                weightFillOpacity(weight),
              )}
              style={{ width: `${weight}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded details — grid-rows trick: always mounted, animates height */}
      {enabled && showDetails && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border/70 px-4 py-3 space-y-3">
              {/* Option scores for radio/select */}
              {hasOptions && model?.optionScores && (
                <div className="space-y-2">
                  <p className={SECTION_LABEL}>Option scores</p>
                  {question.options!.map((opt) => {
                    const score = model.optionScores?.[opt.value] ?? 0;
                    return (
                      <div key={opt.value} className="flex items-center gap-3">
                        <span className="text-xs text-foreground min-w-0 flex-1 truncate">
                          {opt.label}
                        </span>
                        <div className="w-24 h-1 rounded-full bg-foreground/[0.06] overflow-hidden flex-shrink-0">
                          <div
                            className={cn(
                              'h-full rounded-full bg-foreground transition-all duration-150',
                              weightFillOpacity(score / 5),
                            )}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={score}
                          onChange={(e) => onOptionScoreChange(opt.value, Number(e.target.value) || 0)}
                          className="w-16 h-7 text-xs text-center bg-background border-border/70"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Range buckets for number fields */}
              {hasRanges && (
                <div className="space-y-2">
                  <p className={SECTION_LABEL}>Score ranges</p>
                  {model!.ranges!.map((range, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={range.min}
                        onChange={(e) => onRangeChange(idx, 'min', Number(e.target.value))}
                        placeholder="Min"
                        className="w-20 h-7 text-xs bg-background border-border/70"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="number"
                        value={range.max ?? ''}
                        onChange={(e) => onRangeChange(idx, 'max', e.target.value ? Number(e.target.value) : null)}
                        placeholder="Max"
                        className="w-20 h-7 text-xs bg-background border-border/70"
                      />
                      <span className="text-xs text-muted-foreground">=</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={range.points}
                        onChange={(e) => onRangeChange(idx, 'points', Number(e.target.value) || 0)}
                        className="w-16 h-7 text-xs bg-background border-border/70"
                      />
                      <span className="text-[10px] text-muted-foreground">pts</span>
                      <button
                        type="button"
                        onClick={() => onRemoveRange(idx)}
                        className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
                      >
                        <Minus size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={onAddRange}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors duration-150"
                  >
                    <Plus size={12} /> Add range
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Scoring Tab ─────────────────────────────────────────────────────────

export function ScoringTab({
  config,
  slug,
  leadType,
  scoringModel,
  onScoringModelChange,
  onSave,
}: ScoringTabProps) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Get all scorable questions
  const scorableQuestions = useMemo(() => {
    const qs: FormQuestion[] = [];
    for (const section of config.sections) {
      for (const q of section.questions) {
        if (isScorableQuestion(q)) qs.push(q);
      }
    }
    return qs;
  }, [config]);

  // Non-scorable fields
  const nonScorableQuestions = useMemo(() => {
    const qs: FormQuestion[] = [];
    for (const section of config.sections) {
      for (const q of section.questions) {
        if (!isScorableQuestion(q)) qs.push(q);
      }
    }
    return qs;
  }, [config]);

  // Total weight
  const totalWeight = useMemo(() => {
    if (!scoringModel) return 0;
    return Object.values(scoringModel.weights).reduce((sum, q) => sum + q.weight, 0);
  }, [scoringModel]);

  // ── Generate scoring model ─────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/form-config/generate-scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, leadType, formConfig: config }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to generate scoring model');
      }
      const data = await res.json();
      onScoringModelChange(data.scoringModel);
      setHasUnsavedChanges(false);
      toast.success('Draft saved — tune it below if you want.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not draft one right now. Try again.');
    } finally {
      setGenerating(false);
    }
  }, [slug, leadType, config, onScoringModelChange]);

  // ── Save scoring model ─────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!scoringModel) return;
    setSaving(true);
    try {
      await onSave(scoringModel);
      setHasUnsavedChanges(false);
      toast.success('Saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }, [scoringModel, onSave]);

  // ── Weight adjustment (redistributes) ──────────────────────────────────────

  const handleWeightChange = useCallback(
    (questionId: string, delta: number) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId]?.weight ?? 0;
      const newWeight = Math.max(0, Math.min(100, current + delta));
      const diff = newWeight - current;
      if (diff === 0) return;

      // Redistribute from/to other enabled questions
      const others = Object.entries(scoringModel.weights).filter(
        ([id, q]) => id !== questionId && q.weight > 0,
      );
      const othersTotal = others.reduce((s, [, q]) => s + q.weight, 0);

      const newWeights = { ...scoringModel.weights };
      newWeights[questionId] = { ...newWeights[questionId], weight: newWeight };

      if (othersTotal > 0 && diff !== 0) {
        const remaining = -diff;
        for (const [id, q] of others) {
          const proportion = q.weight / othersTotal;
          const adjustment = Math.round(remaining * proportion);
          newWeights[id] = { ...newWeights[id], weight: Math.max(0, q.weight + adjustment) };
        }
      }

      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  // ── Toggle question on/off ─────────────────────────────────────────────────

  const handleToggle = useCallback(
    (questionId: string) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      const isEnabled = current && current.weight > 0;

      const newWeights = { ...scoringModel.weights };

      if (isEnabled) {
        // Disable: set to 0, redistribute weight to others
        const freed = current.weight;
        newWeights[questionId] = { ...current, weight: 0 };

        const others = Object.entries(newWeights).filter(([id, q]) => id !== questionId && q.weight > 0);
        const othersTotal = others.reduce((s, [, q]) => s + q.weight, 0);

        if (othersTotal > 0) {
          let remaining = freed;
          for (const [id, q] of others) {
            const share = Math.round((q.weight / othersTotal) * freed);
            newWeights[id] = { ...q, weight: q.weight + share };
            remaining -= share;
          }
          // Give any rounding remainder to first
          if (remaining !== 0 && others.length > 0) {
            const [firstId, firstQ] = others[0];
            newWeights[firstId] = { ...firstQ, weight: (newWeights[firstId]?.weight ?? 0) + remaining };
          }
        }
      } else {
        // Enable: give a fair share from others
        const enabledCount = Object.values(newWeights).filter((q) => q.weight > 0).length;
        const fairShare = enabledCount > 0 ? Math.round(100 / (enabledCount + 1)) : 100;

        newWeights[questionId] = {
          weight: fairShare,
          optionScores: current?.optionScores,
          ranges: current?.ranges,
        };

        // Reduce others proportionally
        const others = Object.entries(newWeights).filter(([id, q]) => id !== questionId && q.weight > 0);
        const othersTotal = others.reduce((s, [, q]) => s + q.weight, 0);
        const targetOthersTotal = 100 - fairShare;

        if (othersTotal > 0) {
          for (const [id, q] of others) {
            newWeights[id] = { ...q, weight: Math.round((q.weight / othersTotal) * targetOthersTotal) };
          }
        }
      }

      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  // ── Option score change ────────────────────────────────────────────────────

  const handleOptionScoreChange = useCallback(
    (questionId: string, optValue: string, score: number) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      if (!current) return;
      const newOptScores = { ...(current.optionScores ?? {}), [optValue]: Math.max(0, Math.min(100, score)) };
      const newWeights = {
        ...scoringModel.weights,
        [questionId]: { ...current, optionScores: newOptScores },
      };
      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  // ── Range changes ──────────────────────────────────────────────────────────

  const handleRangeChange = useCallback(
    (questionId: string, idx: number, field: keyof NumberRange, value: number | string | null) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      if (!current?.ranges) return;
      const newRanges = [...current.ranges];
      newRanges[idx] = { ...newRanges[idx], [field]: value };
      const newWeights = {
        ...scoringModel.weights,
        [questionId]: { ...current, ranges: newRanges },
      };
      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  const handleAddRange = useCallback(
    (questionId: string) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      if (!current) return;
      const ranges = [...(current.ranges ?? [])];
      const lastMax = ranges.length > 0 ? (ranges[ranges.length - 1].max ?? 10000) : 0;
      ranges.push({ min: lastMax, max: null, points: 50, label: '' });
      const newWeights = {
        ...scoringModel.weights,
        [questionId]: { ...current, ranges },
      };
      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  const handleRemoveRange = useCallback(
    (questionId: string, idx: number) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      if (!current?.ranges) return;
      const newRanges = current.ranges.filter((_, i) => i !== idx);
      const newWeights = {
        ...scoringModel.weights,
        [questionId]: { ...current, ranges: newRanges },
      };
      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  // ── No model yet ───────────────────────────────────────────────────────────

  if (!scoringModel) {
    return (
      <div className="bg-background border border-border/70 rounded-lg p-10 text-center max-w-2xl mx-auto">
        <h3 className={cn(H2, 'mb-2')} style={TITLE_FONT}>
          Teach the assistant what you look for
        </h3>
        <p className={cn(BODY_MUTED, 'max-w-md mx-auto leading-relaxed mb-5')}>
          We&apos;ll read your questions and draft a starting point — which
          answers count as a strong {leadType === 'rental' ? 'rental' : 'buyer'} lead
          vs. a weak one. You can tune it afterwards.
        </p>
        <PrimaryButton onClick={handleGenerate} disabled={generating} className="mx-auto">
          {generating ? (
            <><Loader2 size={14} className="animate-spin" /> Thinking…</>
          ) : (
            <><MessageCircle size={14} /> Draft it for me</>
          )}
        </PrimaryButton>
      </div>
    );
  }

  // ── Has model ──────────────────────────────────────────────────────────────

  const totalIsBalanced = totalWeight === 100;

  return (
    <div className="space-y-4">
      {/* Header: Total weight + actions */}
      <div className="bg-background border border-border/70 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Total weight</span>
            <MutedPill className={cn(!totalIsBalanced && 'text-foreground')}>
              {totalWeight}%{!totalIsBalanced && ' · should be 100%'}
            </MutedPill>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && <MutedPill>unsaved</MutedPill>}
            <GhostButton onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <MessageCircle size={13} />
              )}
              Regenerate
            </GhostButton>
            <PrimaryButton onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              Save
            </PrimaryButton>
          </div>
        </div>
        {/* Segmented weight bar — paper-flat foreground fill, opacity steps separate segments */}
        <div className="h-2 rounded-full bg-foreground/[0.06] overflow-hidden flex">
          {scorableQuestions.map((q, idx) => {
            const w = scoringModel.weights[q.id]?.weight ?? 0;
            if (w <= 0) return null;
            // Alternate opacity slightly so adjacent segments are visually distinguishable
            // without introducing hue. 100% / 75% alternation.
            const alt = idx % 2 === 0 ? 'opacity-100' : 'opacity-70';
            return (
              <div
                key={q.id}
                className={cn('h-full bg-foreground transition-all duration-150', alt)}
                style={{ width: `${w}%` }}
                title={`${q.label}: ${w}%`}
              />
            );
          })}
        </div>
      </div>

      {/* AI reasoning */}
      {scoringModel.reasoning && (
        <div className="rounded-lg border border-border/70 bg-background px-4 py-3">
          <p className="text-xs text-foreground/80 leading-relaxed">{scoringModel.reasoning}</p>
          {scoringModel.generatedAt && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Generated {formatTimeAgo(scoringModel.generatedAt)}
            </p>
          )}
        </div>
      )}

      {/* Question cards */}
      <div className="space-y-2 max-h-[560px] overflow-y-auto min-w-0">
        {scorableQuestions.map((q) => {
          const model = scoringModel.weights[q.id];
          const enabled = model != null && model.weight > 0;
          return (
            <QuestionCard
              key={q.id}
              question={q}
              model={model}
              enabled={enabled}
              onToggle={() => handleToggle(q.id)}
              onWeightChange={(delta) => handleWeightChange(q.id, delta)}
              onOptionScoreChange={(optVal, score) => handleOptionScoreChange(q.id, optVal, score)}
              onRangeChange={(idx, field, val) => handleRangeChange(q.id, idx, field, val)}
              onAddRange={() => handleAddRange(q.id)}
              onRemoveRange={(idx) => handleRemoveRange(q.id, idx)}
            />
          );
        })}
      </div>

      {/* Not scored section */}
      {nonScorableQuestions.length > 0 && (
        <div className="bg-background border border-border/70 rounded-lg px-4 py-3">
          <p className={cn(SECTION_LABEL, 'mb-2')}>
            Not scored ({nonScorableQuestions.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {nonScorableQuestions.map((q) => (
              <MutedPill key={q.id}>{q.label}</MutedPill>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
