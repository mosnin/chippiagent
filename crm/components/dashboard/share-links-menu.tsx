'use client';

import { useState, useEffect, useRef } from 'react';
import { Link2, Copy, Check, ExternalLink, ClipboardList, CalendarDays } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { H3 } from '@/lib/typography';

interface ShareLinksMenuProps {
  slug: string;
}

interface LinkRowProps {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  label: string;
  description: string;
  url: string;
  previewHref: string;
}

function LinkRow({ icon: Icon, label, description, url, previewHref }: LinkRowProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // No-op — clipboard rejected. Surfacing an error here would be louder
      // than the failure deserves; the user can still use the preview link.
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon size={13} strokeWidth={1.75} className="text-muted-foreground/70 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-foreground leading-tight">{label}</p>
          <p className="text-[10.5px] text-muted-foreground/70 leading-tight mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <code className="flex-1 text-[11px] bg-foreground/[0.04] rounded px-2 py-1.5 font-mono text-muted-foreground border border-border/50 truncate">
          {url.replace(/^https?:\/\//, '')}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}
          className={cn(
            'inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors duration-150 flex-shrink-0 active:scale-[0.98]',
            copied
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
          )}
        >
          {copied ? <Check size={12} strokeWidth={2.25} /> : <Copy size={12} strokeWidth={1.75} />}
        </button>
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${label.toLowerCase()} in new tab`}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 flex-shrink-0 active:scale-[0.98]"
        >
          <ExternalLink size={12} strokeWidth={1.75} />
        </a>
      </div>
    </div>
  );
}

export function ShareLinksMenu({ slug }: ShareLinksMenuProps) {
  // Compose absolute URLs only after mount so the value matches the actual
  // host the realtor is on. Avoids SSR/CSR text mismatch and works on dev,
  // staging, and prod without env-var threading into client components.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const intakePath = `/apply/${slug}`;
  const bookingPath = `/book/${slug}`;
  const intakeUrl = origin ? `${origin}${intakePath}` : intakePath;
  const bookingUrl = origin ? `${origin}${bookingPath}` : bookingPath;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Share my links"
          title="Share my links"
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025] transition-colors data-[state=open]:bg-foreground/[0.045] data-[state=open]:text-foreground"
        >
          <Link2 size={14} strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-3 space-y-3">
        <div>
          <p className={`${H3} leading-tight`}>Your links</p>
          <p className="text-[11px] text-muted-foreground/80 leading-tight mt-0.5">
            Share these with prospects.
          </p>
        </div>

        <div className="h-px bg-border/60" />

        <LinkRow
          icon={ClipboardList}
          label="Application form"
          description="Where new leads start their application"
          url={intakeUrl}
          previewHref={intakePath}
        />

        <LinkRow
          icon={CalendarDays}
          label="Tour booking"
          description="Where prospects book a tour with you"
          url={bookingUrl}
          previewHref={bookingPath}
        />
      </PopoverContent>
    </Popover>
  );
}
