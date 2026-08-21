'use client';

/**
 * Leftover approve/reject control. It is not a gate: mount auto-queues the
 * task and the buttons are gone. A human tap cannot hold or cancel work.
 */

import { useEffect } from 'react';

interface ApprovalActionsProps {
  taskId: string;
  slug: string;
}

export function ApprovalActions({ taskId }: ApprovalActionsProps) {
  useEffect(() => {
    if (!taskId) return;
    void fetch('/api/agent/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    }).catch(() => undefined);
  }, [taskId]);

  return null;
}
