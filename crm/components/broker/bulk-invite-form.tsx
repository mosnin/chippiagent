'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, X, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  SeatUsagePill,
  normalizeSeatUsage,
  type SeatPlan,
} from '@/components/broker/seat-usage-pill';

interface BulkResult {
  email: string;
  status: 'sent' | 'duplicate' | 'error';
  error?: string;
}

export interface BulkInviteFormSeatUsage {
  plan: SeatPlan;
  used: number;
  seatLimit: number | null;
}

interface BulkInviteFormProps {
  /**
   * Current seat usage for the brokerage. When present and well-formed, an
   * inline pill is rendered next to the submit button and the form blocks
   * submit when the batch would exceed the cap.
   */
  seatUsage?: BulkInviteFormSeatUsage;
}

interface SeatLimitError {
  text: string;
}

export function BulkInviteForm({ seatUsage }: BulkInviteFormProps = {}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [seatLimitError, setSeatLimitError] = useState<SeatLimitError | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const normalizedUsage = normalizeSeatUsage(seatUsage);
  const remaining: number =
    normalizedUsage === null
      ? Number.POSITIVE_INFINITY
      : normalizedUsage.seatLimit === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, normalizedUsage.seatLimit - normalizedUsage.used);

  const requested = Math.min(emails.length, 50);
  const exceedsCap = requested > remaining;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseEmails(text);
      setEmails(parsed);
      setResults(null);
      setSeatLimitError(null);
    };
    reader.readAsText(file);
  }

  function handlePaste(text: string) {
    const parsed = parseEmails(text);
    setEmails(parsed);
    setResults(null);
    setSeatLimitError(null);
  }

  async function handleSend() {
    if (emails.length === 0) return;
    if (exceedsCap) return; // client-side gate; server still enforces
    setSending(true);
    setResults(null);
    setSeatLimitError(null);

    try {
      const res = await fetch('/api/broker/invite/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: emails.map((email) => ({ email, role: 'realtor_member' })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results ?? []);
        toast.success(`${data.sent} invitation${data.sent !== 1 ? 's' : ''} sent`);
      } else if (res.status === 402 && data?.code === 'seat_limit') {
        const msg: string =
          typeof data.error === 'string' ? data.error : 'Seat limit reached.';
        setSeatLimitError({ text: msg });
        toast.error(msg);
      } else {
        toast.error(data.error ?? 'Failed to send invitations');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSending(false);
    }
  }

  function handleClear() {
    setEmails([]);
    setResults(null);
    setSeatLimitError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const sentCount = results?.filter((r) => r.status === 'sent').length ?? 0;
  const dupCount = results?.filter((r) => r.status === 'duplicate').length ?? 0;
  const errCount = results?.filter((r) => r.status === 'error').length ?? 0;

  const remainingLabel =
    remaining === Number.POSITIVE_INFINITY ? null : Math.max(0, Math.floor(remaining));

  return (
    <Card>
      <CardContent className="px-5 py-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Upload size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Bulk invite</p>
              <p className="text-xs text-muted-foreground">Upload a CSV or paste a list of emails (max 50)</p>
            </div>
          </div>
          {normalizedUsage && (
            <SeatUsagePill
              compact
              plan={normalizedUsage.plan}
              used={normalizedUsage.used}
              seatLimit={normalizedUsage.seatLimit}
            />
          )}
        </div>

        {/* File upload */}
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFile}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            className="gap-1.5"
          >
            <FileText size={13} /> Upload CSV
          </Button>
          <span className="text-xs text-muted-foreground">or paste emails below</span>
        </div>

        {/* Textarea for pasting */}
        <textarea
          className="w-full h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Enter emails, one per line or comma-separated"
          value={emails.join('\n')}
          onChange={(e) => handlePaste(e.target.value)}
        />

        {emails.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {emails.length} email{emails.length !== 1 ? 's' : ''} ready
              {emails.length > 50 && <span className="text-destructive font-medium"> (max 50 — extra will be trimmed)</span>}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 gap-1">
                <X size={12} /> Clear
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={sending || exceedsCap}
                className="gap-1.5"
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {sending ? 'Sending...' : `Send ${requested} invite${emails.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        )}

        {exceedsCap && remainingLabel !== null && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Only {remainingLabel} seat{remainingLabel === 1 ? '' : 's'} available.{' '}
            <Link href="/broker/billing" className="underline underline-offset-2">
              Upgrade plan
            </Link>{' '}
            to invite more.
          </p>
        )}

        {seatLimitError && (
          <div className="text-xs text-destructive">
            <p>{seatLimitError.text}</p>
            <Link
              href="/broker/billing"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive underline underline-offset-2 hover:opacity-80"
            >
              Manage plan <ArrowUpRight size={11} />
            </Link>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-3 text-xs">
              {sentCount > 0 && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={12} /> {sentCount} sent
                </span>
              )}
              {dupCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertCircle size={12} /> {dupCount} duplicate{dupCount !== 1 ? 's' : ''}
                </span>
              )}
              {errCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle size={12} /> {errCount} error{errCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {results.filter((r) => r.status === 'error').length > 0 && (
              <div className="max-h-24 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
                {results.filter((r) => r.status === 'error').map((r, i) => (
                  <p key={i} className="text-destructive">
                    {r.email}: {r.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Parse emails from CSV text or newline/comma-separated input */
function parseEmails(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    .filter((e, i, arr) => arr.indexOf(e) === i) // dedupe
    .slice(0, 50);
}
