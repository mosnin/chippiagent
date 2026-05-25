'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Public-facing URL for this contact's applicant portal. */
  url: string;
  className?: string;
}

/**
 * Copy applicant portal link — small affordance on the contact detail page
 * so the realtor can paste the URL into a text or email manually. v0
 * discoverability for the applicant portal; in a later pass the agent can
 * embed this link in outbound SMS/email automatically.
 *
 * Two actions in one row: Copy + Open. Both quiet, both keyboard-friendly.
 * After copy: button reads "Copied" for ~1.5s, then resets.
 */
export function CopyApplicantPortalLink({ url, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — silent fallback (the link is also visible via Open)
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? 'Copied' : 'Copy applicant portal link'}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 active:scale-[0.98]"
      >
        {copied ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy portal link'}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
      >
        <ExternalLink size={11} />
        Preview
      </a>
    </div>
  );
}
