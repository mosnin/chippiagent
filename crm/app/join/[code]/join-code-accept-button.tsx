'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

export function JoinCodeAcceptButton({ code }: { code: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/broker/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok) {
        setDone(true);
        // Redirect to setup which routes brokers to /broker and realtors to /s/slug
        setTimeout(() => (window.location.href = '/setup'), 1500);
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
      <Button onClick={handleJoin} disabled={loading} size="sm">
        {loading ? 'Joining…' : 'Join brokerage'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
