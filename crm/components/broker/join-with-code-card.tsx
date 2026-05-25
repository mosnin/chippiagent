'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Hash, CheckCircle2 } from 'lucide-react';

export function JoinWithCodeCard() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState<string | null>(null); // brokerage name on success

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/broker/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setJoined(data.brokerageName);
        setTimeout(() => (window.location.href = '/broker'), 1500);
      } else {
        setError(data.error ?? 'Failed to join brokerage.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (joined) {
    return (
      <Card>
        <CardContent className="px-5 py-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={16} />
            <p className="text-sm font-medium">Joined {joined}! Redirecting…</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Hash size={15} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Join a brokerage</p>
            <p className="text-xs text-muted-foreground">Enter an invite code from your broker</p>
          </div>
        </div>
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            type="text"
            required
            placeholder="ABCD-EF23"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={9}
            className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" size="sm" disabled={loading || !code.trim()}>
            {loading ? 'Joining…' : 'Join'}
          </Button>
        </form>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
