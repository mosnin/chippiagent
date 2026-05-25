'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Loader2, ArrowRight } from 'lucide-react';
import {
  renderTemplate,
  type MessageChannel,
  type MessageTemplate,
  type TemplateContext,
} from '@/lib/message-templates';

interface Props {
  channel: MessageChannel;
  ctx: TemplateContext;
  onPick: (result: { subject: string | null; body: string; templateName: string }) => void;
  /** Tweak the trigger label — defaults to "Templates". */
  label?: string;
  /** Disable the trigger (e.g. while the parent is sending). */
  disabled?: boolean;
}

/**
 * Drop-in template picker. Fetches all templates once for the current space,
 * filters by channel, and renders the selection against the supplied context.
 * Parent receives a { subject, body } pair to slot into its own compose UI.
 */
export function TemplatePicker({ channel, ctx, onPick, label = 'Templates', disabled }: Props) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/message-templates');
        if (res.ok) {
          const data: MessageTemplate[] = await res.json();
          if (!cancelled) setTemplates(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Close on outside-click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [open]);

  const applicable = templates.filter((t) => t.channel === channel);

  function pick(t: MessageTemplate) {
    onPick({
      subject: t.subject ? renderTemplate(t.subject, ctx) : null,
      body: renderTemplate(t.body, ctx),
      templateName: t.name,
    });
    setOpen(false);
  }

  return (
    <div className="relative inline-block" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={11} className="animate-spin" /> : <MessageCircle size={11} />}
        {label}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 z-30 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {channel} templates
            </p>
            <a
              href="/settings?tab=apps"
              className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Manage <ArrowRight size={9} />
            </a>
          </div>

          {applicable.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No {channel} templates yet.
              <br />
              <a href="/settings?tab=apps" className="underline">Create one →</a>
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-border">
              {applicable.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => pick(t)}
                    className="w-full px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.subject ?? t.body.slice(0, 80)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
