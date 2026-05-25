'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Brain, Activity, Zap, CheckCircle2, XCircle, RefreshCw, Loader2, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { ImportanceDot } from './importance-dot';
import { ChippiAssessmentCard } from '@/components/agent/chippi-assessment-card';

interface AgentMemory {
  id: string;
  memoryType: 'fact' | 'observation';
  content: string;
  importance: number;
  createdAt: string;
}

interface AgentActivity {
  id: string;
  agentType: string;
  action: string;
  outcome: string;
  summary: string | null;
  createdAt: string;
}

interface AgentDealData {
  dealId: string;
  memories: AgentMemory[];
  activity: AgentActivity[];
}

const AGENT_LABELS: Record<string, string> = {
  lead_nurture: 'Lead Nurture',
  deal_sentinel: 'Deal Sentinel',
  long_term_nurture: 'Long-Term Nurture',
  lead_scorer: 'Lead Scorer',
};


export function AgentDealPanel({ dealId, slug, dealTitle }: { dealId: string; slug: string; dealTitle?: string }) {
  const [data, setData] = useState<AgentDealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [activeSection, setActiveSection] = useState<'memories' | 'activity'>('memories');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/deal/${dealId}`);
      if (res.ok) setData(await res.json());
    } catch {
      // silently fail — panel is not critical path
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRequestAnalysis() {
    setTriggering(true);
    try {
      await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'deal_stage_changed', dealId }),
      });
      setTriggered(true);
      setTimeout(() => setTriggered(false), 4000);
    } finally {
      setTriggering(false);
    }
  }

  const memories = data?.memories ?? [];
  const activity = data?.activity ?? [];
  const hasContent = memories.length > 0 || activity.length > 0;

  if (loading) {
    return (
      <div className="space-y-3">
        <ChippiAssessmentCard entityType="deal" entityId={dealId} entityName={dealTitle ?? 'this deal'} slug={slug} />
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={13} className="text-primary animate-pulse" />
            <span className="text-sm font-semibold">Agent Intelligence</span>
          </div>
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-3.5 bg-muted rounded animate-pulse" style={{ width: `${55 + i * 15}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ChippiAssessmentCard entityType="deal" entityId={dealId} entityName={dealTitle ?? 'this deal'} slug={slug} />
    <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain size={13} className="text-primary" />
          <span className="text-sm font-semibold">Agent Intelligence</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/s/${slug}/chippi?q=${encodeURIComponent(`Tell me about my deal "${dealTitle ?? 'this deal'}" and suggest next steps`)}`}
            className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] text-xs font-medium rounded-md border border-border hover:bg-muted/60 transition-colors"
          >
            <MessageCircle size={11} />
            Ask Chippi
          </Link>
          <button
            onClick={() => void load()}
            className="p-1.5 min-h-[36px] text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => void handleRequestAnalysis()}
            disabled={triggering}
            className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] text-xs font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {triggering ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            {triggered ? 'Queued!' : 'Analyse'}
          </button>
        </div>
      </div>

      {!hasContent ? (
        <div className="px-4 py-6 text-center">
          <Brain size={24} className="text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No agent context yet for this deal.</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-border text-xs">
            {([
              { key: 'memories' as const, label: 'Memory', count: memories.length, icon: Brain },
              { key: 'activity' as const, label: 'Activity', count: activity.length, icon: Activity },
            ]).map(({ key, label, count, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors whitespace-nowrap',
                  activeSection === key
                    ? 'border-primary text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={10} />
                {label}
                {count > 0 && (
                  <span className={cn(
                    'text-xs px-1 rounded',
                    activeSection === key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2.5 max-h-[320px] overflow-y-auto">
            {activeSection === 'memories' && (
              memories.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No memories stored for this deal.</p>
              ) : (
                memories.map(mem => (
                  <div key={mem.id} className="flex gap-2 items-start text-sm">
                    <ImportanceDot importance={mem.importance} />
                    <div className="flex-1 min-w-0">
                      <p className="leading-snug text-sm">{mem.content}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {mem.memoryType === 'fact' ? 'Fact' : 'Observation'} · {timeAgo(mem.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )
            )}

            {activeSection === 'activity' && (
              activity.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No agent activity for this deal.</p>
              ) : (
                activity.map(entry => (
                  <div key={entry.id} className="flex gap-2 items-start text-sm">
                    <span className={cn(
                      'mt-1 w-1.5 h-1.5 rounded-full shrink-0',
                      entry.outcome === 'success' ? 'bg-emerald-500' :
                      entry.outcome === 'error' ? 'bg-destructive' : 'bg-muted-foreground/40',
                    )} />
                    <div className="flex-1 min-w-0">
                      {entry.summary ? (
                        <p className="leading-snug">{entry.summary}</p>
                      ) : (
                        <p className="leading-snug text-muted-foreground">{entry.action}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {AGENT_LABELS[entry.agentType] ?? entry.agentType} · {timeAgo(entry.createdAt)}
                      </p>
                    </div>
                    {entry.outcome === 'success' && <CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />}
                    {entry.outcome === 'error' && <XCircle size={11} className="text-destructive shrink-0 mt-0.5" />}
                  </div>
                ))
              )
            )}
          </div>
        </>
      )}
    </div>
    </div>
  );
}
