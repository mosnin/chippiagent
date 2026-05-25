'use client';

import { useState, useEffect, useRef } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntakeLinkRowProps {
  url: string;
  previewHref: string;
  /** Optional: copy a different string (e.g. an embed snippet) than what's
   *  shown in the chip. Falls back to `url` when omitted. */
  copyValue?: string;
  /** Optional override for the displayed text (defaults to `url` minus protocol). */
  display?: string;
  /** Hide the preview link button (e.g. for tracking-link rows where there's
   *  no separate preview destination). */
  hidePreview?: boolean;
}

/**
 * The link-chip pattern — protocol-stripped URL in a hairlined chip, with
 * Copy and (optionally) Preview as small ghost icon buttons. Mirrors
 * `components/dashboard/share-links-menu.tsx`'s LinkRow so all link
 * displays in the app feel like one component.
 */
export function IntakeLinkRow({
  url,
  previewHref,
  copyValue,
  display,
  hidePreview,
}: IntakeLinkRowProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue ?? url);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard rejected — preview still works.
    }
  };

  const shown = display ?? url.replace(/^https?:\/\//, '');

  return (
    <div className="flex items-center gap-1.5">
      <code className="flex-1 text-[12px] bg-foreground/[0.04] rounded-md px-2.5 py-1.5 font-mono text-muted-foreground border border-border/60 truncate">
        {shown}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy link'}
        className={cn(
          'inline-flex items-center justify-center w-8 h-8 rounded-md border transition-colors duration-150 flex-shrink-0 active:scale-[0.98]',
          copied
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
        )}
      >
        {copied ? (
          <Check size={13} strokeWidth={2.25} />
        ) : (
          <Copy size={13} strokeWidth={1.75} />
        )}
      </button>
      {!hidePreview && (
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          aria-label="Open in new tab"
          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] active:bg-foreground/[0.045] transition-colors duration-150 flex-shrink-0 active:scale-[0.98]"
        >
          <ExternalLink size={13} strokeWidth={1.75} />
        </a>
      )}
    </div>
  );
}
