'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border bg-card hover:bg-muted transition-colors"
    >
      {copied ? (
        <>
          <Check size={13} className="text-green-600 dark:text-green-400" />
          <span className="text-green-700 dark:text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy size={13} />
          Copy link
        </>
      )}
    </button>
  );
}
