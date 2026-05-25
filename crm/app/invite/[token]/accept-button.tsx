'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

interface AcceptButtonProps {
  token: string;
}

export function AcceptButton({ token }: AcceptButtonProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleAccept() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/invitations/${token}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setDone(true);
        // Broker admins go straight to /broker; realtors go through /setup
        const dest = data.roleToAssign === 'broker_admin' ? '/broker' : '/setup';
        setTimeout(() => (window.location.href = dest), 1500);
      } else {
        setError(data.error ?? 'Something went wrong.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium text-sm">
        <CheckCircle2 size={16} />
        Joined! Redirecting…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleAccept} disabled={loading} size="sm">
        {loading ? 'Joining…' : 'Accept invitation'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
