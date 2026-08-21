'use client';

/**
 * ApprovalsPill used to be the header gate: a count of paused work and a
 * sheet of approve/reject buttons. That product is gone.
 *
 * Mount still hits GET /api/chippi/approvals so any leftover paused rows
 * are auto-queued. The chrome itself never renders — the realtor is not
 * a required step.
 */

import { useEffect } from 'react';

export function ApprovalsPill() {
  useEffect(() => {
    void fetch('/api/chippi/approvals').catch(() => undefined);
  }, []);

  return null;
}
