'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bot, Loader2, Play, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AgentSettings {
  spaceId: string;
  enabled: boolean;
  dailyTokenBudget: number;
}

interface AgentUsage {
  used: number;
  limit: number;
  pct: number;
  resetsAt: string;
}

interface AgentStatus {
  pendingDrafts: number;
  lastRunAt: string | null;
}

const BUDGET_PRESETS = [
  { label: '10k', value: 10_000, desc: '~40 runs/day' },
  { label: '25k', value: 25_000, desc: '~100 runs/day' },
  { label: '50k', value: 50_000, desc: '~200 runs/day' },
  { label: '100k', value: 100_000, desc: '~400 runs/day' },
] as const;

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  const hrs = Math.floor(diff / 3_600_000);
  return hrs > 0 ? `${hrs}h` : 'soon';
}

interface Props { slug: string; }

export function AgentSettingsPanel({ slug: _slug }: Props) {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [usage, setUsage] = useState<AgentUsage | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [triggeringRun, setTriggeringRun] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  const load = useCallback(async () => {
    const [settingsRes, usageRes, draftsRes, activityRes] = await Promise.all([
      fetch('/api/agent/settings'),
      fetch('/api/agent/usage'),
      fetch('/api/agent/drafts?status=pending&limit=1'),
      fetch('/api/agent/activity?limit=1'),
    ]);
    if (settingsRes.ok) setSettings(await settingsRes.json());
    if (usageRes.ok) setUsage(await usageRes.json());

    let pendingDrafts = 0;
    if (draftsRes.ok) {
      const drafts = await draftsRes.json();
      pendingDrafts = Array.isArray(drafts) ? drafts.length : 0;
    }
    let lastRunAt: string | null = null;
    if (activityRes.ok) {
      const activity = await activityRes.json();
      lastRunAt = activity[0]?.createdAt ?? null;
    }
    setStatus({ pendingDrafts, lastRunAt });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveField(patch: Partial<AgentSettings>, fieldKey: string) {
    if (!settings) return;
    const previous = settings;
    setSaving(true);
    const merged = { ...settings, ...patch };
    try {
      const res = await fetch('/api/agent/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (res.ok) {
        setSettings(await res.json());
        setSavedField(fieldKey);
        setTimeout(() => setSavedField(null), 2000);
      } else {
        setSettings(previous);
        toast.error("Couldn't save that. Try again.");
      }
    } catch {
      setSettings(previous);
      toast.error("I lost the connection. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function triggerRun() {
    setTriggeringRun(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/agent/run-now', { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as { triggered: boolean; method?: string; note?: string };
        if (data.triggered) {
          setRunResult(data.method === 'modal' ? 'On it.' : (data.note ?? 'Queued for the next sweep.'));
          setTimeout(() => void load(), 3000);
        } else {
          setRunResult("Couldn't kick myself off — check the Modal deployment.");
        }
      }
    } catch {
      setRunResult("I lost the connection.");
    } finally {
      setTriggeringRun(false);
      setTimeout(() => setRunResult(null), 5000);
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((n) => <div key={n} className="h-20 rounded-lg bg-muted/40 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Status + Run Now */}
      <div className="rounded-lg border border-border/70 bg-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
              settings.enabled
                ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400'
                : 'bg-muted text-muted-foreground',
            )}>
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">Chippi</p>
                <span className={cn(
                  'text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                  settings.enabled
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                    : 'bg-muted text-muted-foreground',
                )}>
                  {settings.enabled ? 'ACTIVE' : 'PAUSED'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {status?.lastRunAt ? `Last run ${timeAgo(status.lastRunAt)}` : 'No runs yet'}
                {status?.pendingDrafts ? ` · ${status.pendingDrafts} draft${status.pendingDrafts !== 1 ? 's' : ''} awaiting review` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs"
                onClick={() => void triggerRun()}
                disabled={triggeringRun || !settings.enabled}
              >
                {triggeringRun ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                Run now
              </Button>
              {runResult && (
                <p className="text-[11px] text-muted-foreground">{runResult}</p>
              )}
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => {
                if (!checked) {
                  setShowDisableConfirm(true);
                } else {
                  setSettings({ ...settings, enabled: true });
                  void saveField({ enabled: true }, 'enabled');
                }
              }}
            />
          </div>
        </div>

        {/* Token usage meter */}
        {usage && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Today&apos;s usage — {usage.used.toLocaleString()} / {usage.limit.toLocaleString()} tokens
              </span>
              <span className={cn(
                'font-medium',
                usage.pct >= 90 ? 'text-destructive' : usage.pct >= 70 ? 'text-amber-500' : 'text-muted-foreground',
              )}>
                {usage.pct}% · resets in {timeUntil(usage.resetsAt)}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  usage.pct >= 90 ? 'bg-destructive' : usage.pct >= 70 ? 'bg-amber-400' : 'bg-orange-500',
                )}
                style={{ width: `${usage.pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Daily token budget */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">Daily token budget</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Caps OpenAI usage per day for this workspace. Resets at midnight UTC.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {BUDGET_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => {
                setSettings({ ...settings, dailyTokenBudget: preset.value });
                void saveField({ dailyTokenBudget: preset.value }, 'budget');
              }}
              disabled={saving}
              className={cn(
                'flex flex-col items-center px-4 py-2.5 rounded-lg border text-sm transition-all',
                settings.dailyTokenBudget === preset.value
                  ? 'border-orange-500 bg-orange-500/5 text-orange-600 dark:text-orange-400 font-semibold ring-1 ring-orange-500/20'
                  : 'border-border/70 bg-card text-foreground hover:bg-foreground/[0.04]',
              )}
            >
              <span className="font-bold">{preset.label}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">{preset.desc}</span>
            </button>
          ))}
        </div>
        {savedField === 'budget' && (
          <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> Saved</p>
        )}
      </div>

      <AlertDialog open={showDisableConfirm} onOpenChange={setShowDisableConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause me?</AlertDialogTitle>
            <AlertDialogDescription>
              I&apos;ll stop everything I&apos;m doing on my own. Turn me back on whenever you want.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep enabled</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSettings({ ...settings, enabled: false });
                void saveField({ enabled: false }, 'enabled');
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, pause
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
