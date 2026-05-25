'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Bot, ChevronRight, Inbox, HelpCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';

interface StatusData {
  pendingDrafts: number;
  pendingQuestions: number;
  lastRunAt: string | null;
  isRunning: boolean;
}

export function AgentStatusBar({ slug }: { slug: string }) {
  const [status, setStatus] = useState<StatusData>({
    pendingDrafts: 0,
    pendingQuestions: 0,
    lastRunAt: null,
    isRunning: false,
  });
  const [visible, setVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const [draftsRes, questionsRes, runsRes] = await Promise.all([
        fetch('/api/agent/drafts?status=pending&limit=50'),
        fetch('/api/agent/questions?status=pending&limit=50'),
        fetch('/api/agent/runs?limit=1'),
      ]);

      const drafts = draftsRes.ok ? await draftsRes.json() : [];
      const questions = questionsRes.ok ? await questionsRes.json() : [];
      const runs = runsRes.ok ? await runsRes.json() : [];

      const pendingDrafts = Array.isArray(drafts) ? drafts.length : 0;
      const pendingQuestions = Array.isArray(questions) ? questions.length : 0;
      const lastRun = Array.isArray(runs) && runs.length > 0 ? runs[0] : null;
      const lastRunAt = lastRun?.startedAt ?? lastRun?.createdAt ?? null;

      setStatus({ pendingDrafts, pendingQuestions, lastRunAt, isRunning: false });
      setVisible(true);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  if (!visible) return null;

  const hasActivity = status.pendingDrafts > 0 || status.pendingQuestions > 0;
  const agentHref = `/s/${slug}/chippi`;

  return (
    <div className={cn(
      'w-full border-b transition-colors',
      hasActivity
        ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/40'
        : 'bg-muted/30 border-border',
    )}>
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 max-w-screen-2xl mx-auto">
        {/* Chippi identity */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="relative flex-shrink-0">
            <Bot size={13} className={cn(
              hasActivity ? 'text-orange-500' : 'text-muted-foreground',
            )} />
            {status.isRunning && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            )}
          </div>
          <span className={cn(
            'text-[11px] font-semibold tracking-wide hidden sm:inline',
            hasActivity ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground',
          )}>
            CHIPPI
          </span>
        </div>

        <span className="text-muted-foreground/40 text-[10px] hidden sm:inline">·</span>

        {/* Status pills */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
          {status.pendingDrafts > 0 && (
            <Link
              href={agentHref}
              className="flex items-center gap-1 bg-orange-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full hover:bg-orange-600 transition-colors flex-shrink-0"
            >
              <Inbox size={9} />
              {status.pendingDrafts} draft{status.pendingDrafts !== 1 ? 's' : ''}
            </Link>
          )}

          {status.pendingQuestions > 0 && (
            <Link
              href={agentHref}
              className="flex items-center gap-1 bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full hover:bg-amber-600 transition-colors flex-shrink-0"
            >
              <HelpCircle size={9} />
              {status.pendingQuestions} question{status.pendingQuestions !== 1 ? 's' : ''}
            </Link>
          )}

          {!hasActivity && (
            <span className="text-[11px] text-muted-foreground">
              {status.lastRunAt
                ? `Watching your pipeline · last check ${timeAgo(status.lastRunAt)}`
                : 'Standing by.'}
            </span>
          )}

          {hasActivity && status.lastRunAt && (
            <span className="text-[11px] text-muted-foreground hidden md:inline">
              · {timeAgo(status.lastRunAt)}
            </span>
          )}
        </div>

        {/* CTA */}
        <Link
          href={agentHref}
          className={cn(
            'flex items-center gap-0.5 text-[11px] font-medium flex-shrink-0 transition-colors',
            hasActivity
              ? 'text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="hidden sm:inline">{hasActivity ? 'Review' : 'Agent'}</span>
          <ChevronRight size={12} />
        </Link>
      </div>
    </div>
  );
}
