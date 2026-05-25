'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface BrokerageStatusToggleProps {
  brokerageId: string;
  currentStatus: string;
}

export function BrokerageStatusToggle({ brokerageId, currentStatus }: BrokerageStatusToggleProps) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = status === 'active' ? 'suspended' : 'active';
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/brokerages/${brokerageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) setStatus(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={loading}
      className="flex-shrink-0 text-xs"
    >
      {loading ? '…' : status === 'active' ? 'Suspend' : 'Reactivate'}
    </Button>
  );
}
