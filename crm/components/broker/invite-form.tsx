'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Send, ShieldCheck, ArrowUpRight } from 'lucide-react';
import {
  SeatUsagePill,
  normalizeSeatUsage,
  type SeatPlan,
} from '@/components/broker/seat-usage-pill';

export interface InviteFormSeatUsage {
  plan: SeatPlan;
  used: number;
  seatLimit: number | null;
}

interface InviteFormProps {
  isOwner?: boolean;
  /**
   * Current seat usage for the brokerage. When present and well-formed, an
   * inline pill is rendered next to the submit button and the form blocks
   * submit when the cap would be exceeded. Absent / malformed = no pill.
   */
  seatUsage?: InviteFormSeatUsage;
}

interface InviteErrorState {
  text: string;
  /** Present when the API returned `code: 'seat_limit'` (HTTP 402). */
  seatLimit?: boolean;
}

export function InviteForm({ isOwner = true, seatUsage }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'realtor_member' | 'broker_admin'>('realtor_member');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<
    | { type: 'success'; text: string }
    | ({ type: 'error' } & InviteErrorState)
    | null
  >(null);

  const normalizedUsage = normalizeSeatUsage(seatUsage);
  const remaining: number =
    normalizedUsage === null
      ? Number.POSITIVE_INFINITY
      : normalizedUsage.seatLimit === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, normalizedUsage.seatLimit - normalizedUsage.used);

  // A single invite needs 1 seat. Disable the submit when we know we're over cap.
  const overCap = remaining < 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (overCap) return; // client-side gate; server still enforces
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/broker/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), roleToAssign: role }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: data.duplicate ? `Invitation already sent to ${email}.` : `Invitation sent to ${email}.`,
        });
        setEmail('');
        // Refresh to show the new invite in the list
        if (!data.duplicate) window.location.reload();
      } else if (res.status === 402 && data?.code === 'seat_limit') {
        setMessage({
          type: 'error',
          text: typeof data.error === 'string' ? data.error : 'Seat limit reached.',
          seatLimit: true,
        });
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Failed to send invitation.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          placeholder="colleague@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        {isOwner ? (
          <div className="flex rounded-lg border border-input overflow-hidden">
            <button
              type="button"
              onClick={() => setRole('realtor_member')}
              disabled={loading}
              className={`h-9 px-3 text-sm font-medium transition-colors ${
                role === 'realtor_member'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              } disabled:opacity-50`}
            >
              Realtor
            </button>
            <button
              type="button"
              onClick={() => setRole('broker_admin')}
              disabled={loading}
              className={`h-9 px-3 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                role === 'broker_admin'
                  ? 'bg-amber-600 text-white dark:bg-amber-500'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              } disabled:opacity-50`}
            >
              <ShieldCheck size={13} />
              Admin
            </button>
          </div>
        ) : (
          <input type="hidden" name="role" value="realtor_member" />
        )}
        <Button
          type="submit"
          size="sm"
          disabled={loading || overCap}
          className="flex items-center gap-1.5"
        >
          <Send size={14} />
          {loading ? 'Sending...' : 'Send invite'}
        </Button>
      </div>
      {normalizedUsage && (
        <div className="flex items-center gap-2 flex-wrap">
          <SeatUsagePill
            compact
            plan={normalizedUsage.plan}
            used={normalizedUsage.used}
            seatLimit={normalizedUsage.seatLimit}
          />
          {overCap && (
            <span className="text-xs text-rose-600 dark:text-rose-400">
              Only {Math.max(0, Math.floor(remaining))} seats available.{' '}
              <Link href="/broker/billing" className="underline underline-offset-2">
                Upgrade plan
              </Link>{' '}
              to invite more.
            </span>
          )}
        </div>
      )}
      {role === 'broker_admin' && isOwner && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <ShieldCheck size={12} />
          Admins can manage members, leads, and brokerage settings.
        </p>
      )}
      {message && (
        <div
          className={`text-xs ${
            message.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
          }`}
        >
          <p>{message.text}</p>
          {message.type === 'error' && message.seatLimit && (
            <Link
              href="/broker/billing"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive underline underline-offset-2 hover:opacity-80"
            >
              Manage plan <ArrowUpRight size={11} />
            </Link>
          )}
        </div>
      )}
    </form>
  );
}
