'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from '@/lib/chat-models';

/**
 * Settings control — the realtor's "primary model" for Chippi.
 *
 * Reads + writes AgentSettings.chatModel via /api/agent/settings. A
 * workspace that has never touched this sits on DEFAULT_CHAT_MODEL — the
 * picker is invisible weight for the realtor who doesn't care.
 */
export function ChatModelPicker() {
  const [model, setModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/agent/settings');
        if (res.ok) {
          const data = (await res.json()) as { chatModel?: string | null };
          if (!cancelled) setModel(data.chatModel ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(id: string) {
    const current = model ?? DEFAULT_CHAT_MODEL;
    if (saving || id === current) return;
    const previous = model;
    setModel(id);
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/agent/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatModel: id }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setModel(previous);
        toast.error("Couldn't save that. Try again.");
      }
    } catch {
      setModel(previous);
      toast.error('I lost the connection. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const selected = model ?? DEFAULT_CHAT_MODEL;

  if (loading) {
    return <div className="h-40 rounded-lg bg-muted/40 animate-pulse" />;
  }

  return (
    <div className="space-y-2 max-w-2xl">
      {CHAT_MODELS.map((m) => {
        const isSelected = m.id === selected;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => void pick(m.id)}
            disabled={saving}
            aria-pressed={isSelected}
            className={cn(
              'w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
              isSelected
                ? 'border-foreground bg-foreground/[0.04]'
                : 'border-border/70 hover:bg-foreground/[0.025]',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 transition-colors',
                isSelected ? 'border-foreground bg-foreground' : 'border-border',
              )}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium">{m.label}</span>
                {m.id === DEFAULT_CHAT_MODEL && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Default
                  </span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">{m.tagline}</span>
            </span>
          </button>
        );
      })}
      <div className="h-4 pt-1">
        {saving && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 size={11} className="animate-spin" /> Saving…
          </span>
        )}
        {saved && !saving && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 size={11} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
