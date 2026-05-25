'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';

interface ApprovalActionsProps {
  taskId: string;
  slug: string;
}

export function ApprovalActions({ taskId, slug }: ApprovalActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);

  async function handle(action: 'approve' | 'reject') {
    if (pending) return;
    setPending(action);

    try {
      const res = await fetch('/api/agent/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: string }).error ?? 'Something went wrong.';
        toast.error(msg);
        setPending(null);
        return;
      }

      if (action === 'approve') {
        toast.success('Approved. Chippi will continue.');
      } else {
        toast.success('Rejected. Action cancelled.');
      }

      // Refresh the server component so the resolved item disappears.
      router.refresh();
    } catch {
      toast.error('Network error. Try again.');
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2 pl-0.5">
      <button
        onClick={() => handle('approve')}
        disabled={pending !== null}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md
                   bg-foreground text-background text-xs font-medium
                   transition-all duration-150 active:scale-[0.98]
                   focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Check size={13} />
        {pending === 'approve' ? 'Approving…' : 'Approve'}
      </button>

      <button
        onClick={() => handle('reject')}
        disabled={pending !== null}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md
                   border border-border text-foreground text-xs font-medium
                   hover:bg-foreground/[0.04] transition-all duration-150
                   active:scale-[0.98]
                   focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <X size={13} />
        {pending === 'reject' ? 'Rejecting…' : 'Reject'}
      </button>
    </div>
  );
}
