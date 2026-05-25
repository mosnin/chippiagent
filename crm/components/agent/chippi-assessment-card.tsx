'use client';

import { useEffect, useState } from 'react';
import { Bot, Target, TrendingUp, ChevronDown, ChevronUp, MessageCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';

interface Goal {
  id: string;
  goalType: string;
  description: string;
  priority: number;
}

interface AssessmentData {
  brief: string | null;
  briefUpdatedAt: string | null;
  scoreExplanation: string | null;
  explainedScore: number | null;
  goals: Goal[];
  isLoaded: boolean;
}

interface ChippiAssessmentCardProps {
  entityType: 'contact' | 'deal';
  entityId: string;
  entityName: string;
  slug: string;
}

const GOAL_LABELS: Record<string, string> = {
  follow_up_sequence: 'Follow-up sequence',
  tour_booking: 'Book a tour',
  offer_progress: 'Offer progress',
  deal_close: 'Close deal',
  reengagement: 'Re-engage',
  custom: 'Custom goal',
};

export function ChippiAssessmentCard({ entityType, entityId, entityName, slug }: ChippiAssessmentCardProps) {
  const [data, setData] = useState<AssessmentData>({
    brief: null,
    briefUpdatedAt: null,
    scoreExplanation: null,
    explainedScore: null,
    goals: [],
    isLoaded: false,
  });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const briefs = entityType === 'contact'
          ? [fetch(`/api/agent/brief/${entityId}`, { signal: controller.signal })]
          : [Promise.resolve({ ok: false } as Response)];

        const goalsPromise = fetch(
          `/api/agent/goals?status=active&${entityType === 'contact' ? 'contactId' : 'dealId'}=${entityId}&limit=5`,
          { signal: controller.signal }
        );

        const [briefRes, goalsRes] = await Promise.all([...briefs, goalsPromise]);

        const briefData = briefRes.ok ? await briefRes.json() : {};
        const goalsData = goalsRes.ok ? await goalsRes.json() : [];

        setData({
          brief: briefData.brief ?? null,
          briefUpdatedAt: briefData.briefUpdatedAt ?? null,
          scoreExplanation: briefData.scoreExplanation ?? null,
          explainedScore: briefData.explainedScore ?? null,
          goals: Array.isArray(goalsData) ? goalsData.slice(0, 3) : [],
          isLoaded: true,
        });
      } catch {
        setData(prev => ({ ...prev, isLoaded: true }));
      }
    }
    void load();
    return () => controller.abort();
  }, [entityType, entityId]);

  const hasContent = data.brief || data.goals.length > 0 || data.scoreExplanation;

  if (!data.isLoaded) {
    return (
      <div className="rounded-2xl border border-orange-200/60 dark:border-orange-900/30 p-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-orange-200/60 dark:bg-orange-900/40" />
          <div className="h-4 w-32 bg-orange-100 dark:bg-orange-900/30 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-4/5" />
        </div>
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div className="rounded-2xl border border-dashed border-orange-200 dark:border-orange-900/30 p-4 flex items-center gap-3">
        <Bot size={14} className="text-orange-400 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Chippi hasn't assessed {entityName} yet. Run the agent to generate insights.
        </p>
      </div>
    );
  }

  const scoreColor = data.explainedScore !== null
    ? data.explainedScore >= 70 ? 'text-orange-600 dark:text-orange-400'
    : data.explainedScore >= 40 ? 'text-amber-600 dark:text-amber-400'
    : 'text-muted-foreground'
    : '';

  return (
    <div className="rounded-2xl border border-orange-200 dark:border-orange-900/40 bg-gradient-to-br from-orange-50/80 to-white dark:from-orange-950/15 dark:to-transparent overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-orange-50/50 dark:hover:bg-orange-950/10 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
            <Bot size={12} className="text-white" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">Chippi's Assessment</p>
            {data.briefUpdatedAt && (
              <p className="text-[10px] text-orange-400/70">Updated {timeAgo(data.briefUpdatedAt)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data.explainedScore !== null && (
            <span className={cn('text-sm font-bold', scoreColor)}>
              {data.explainedScore}
            </span>
          )}
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Brief — always visible */}
      {data.brief && (
        <div className="px-4 pb-3">
          <p className="text-[13px] text-foreground/80 leading-relaxed">{data.brief}</p>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-orange-100 dark:border-orange-900/30 px-4 py-3 space-y-3">
          {/* Score explanation */}
          {data.scoreExplanation && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">Score reasoning</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{data.scoreExplanation}</p>
            </div>
          )}

          {/* Active goals */}
          {data.goals.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">Active goals</p>
              {data.goals.map(g => (
                <div key={g.id} className="flex items-start gap-2">
                  <Target size={11} className="text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-orange-700 dark:text-orange-300">
                      {GOAL_LABELS[g.goalType] ?? g.goalType}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{g.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
