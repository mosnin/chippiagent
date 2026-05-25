'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface RemoveMemberButtonProps {
  membershipId: string;
  memberName: string;
}

export function RemoveMemberButton({ membershipId, memberName }: RemoveMemberButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleRemove() {
    setLoading(true);
    try {
      const res = await fetch(`/api/broker/members/${membershipId}`, { method: 'DELETE' });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Failed to remove member.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-muted-foreground">Remove?</span>
        <Button
          variant="destructive"
          size="sm"
          className="h-7 text-xs px-2"
          disabled={loading}
          onClick={handleRemove}
        >
          {loading ? '…' : 'Yes, remove'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
      onClick={() => setConfirming(true)}
      title={`Remove ${memberName}`}
    >
      <Trash2 size={13} />
    </Button>
  );
}
