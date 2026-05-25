'use client';

import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toastCopied } from '@/lib/toast-helpers';

interface IntakeLinkCopyButtonProps {
  url: string;
}

export function IntakeLinkCopyButton({ url }: IntakeLinkCopyButtonProps) {
  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    toastCopied('Intake link copied!');
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5 text-xs flex-shrink-0"
    >
      <Copy size={13} />
      Copy
    </Button>
  );
}
