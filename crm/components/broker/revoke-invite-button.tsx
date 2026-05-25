'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface RevokeInviteButtonProps {
  invitationId: string;
}

export function RevokeInviteButton({ invitationId }: RevokeInviteButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleRevoke() {
    setLoading(true);
    try {
      const res = await fetch(`/api/broker/invitations/${invitationId}`, { method: 'PATCH' });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Failed to cancel invitation.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
      disabled={loading}
      onClick={handleRevoke}
      title="Cancel invitation"
    >
      {loading ? <span className="text-xs">…</span> : <X size={13} />}
    </Button>
  );
}
