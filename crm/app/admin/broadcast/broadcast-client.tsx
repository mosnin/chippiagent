'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Send, Users, Loader2, Eye } from 'lucide-react';

export type SegmentKey =
  | 'all'
  | 'onboarded'
  | 'not_onboarded'
  | 'trial'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'no_workspace';

export type PastBroadcast = {
  id: string;
  subject: string;
  segment: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentBy: string;
  createdAt: string;
};

const SEGMENT_LABELS: Record<SegmentKey, { label: string; description: string }> = {
  all: { label: 'All users', description: 'Every account on the platform' },
  onboarded: { label: 'Onboarded', description: 'Finished onboarding' },
  not_onboarded: { label: 'Not onboarded', description: 'Still in setup' },
  trial: { label: 'Trial', description: 'Active trial subscription' },
  active: { label: 'Active', description: 'Paying customers' },
  past_due: { label: 'Past due', description: 'Failed payment' },
  canceled: { label: 'Canceled', description: 'Cancelled subscription' },
  no_workspace: { label: 'No workspace', description: 'User has no space' },
};

const SEGMENT_ORDER: SegmentKey[] = [
  'all',
  'onboarded',
  'not_onboarded',
  'trial',
  'active',
  'past_due',
  'canceled',
  'no_workspace',
];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function BroadcastClient({
  counts,
  pastBroadcasts: initialPast,
}: {
  counts: Record<SegmentKey, number>;
  pastBroadcasts: PastBroadcast[];
}) {
  const [segment, setSegment] = useState<SegmentKey | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSending, startSending] = useTransition();
  const [pastBroadcasts, setPastBroadcasts] = useState<PastBroadcast[]>(initialPast);

  const [preview, setPreview] = useState<{ recipientCount: number; sampleEmails: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const canSubmit =
    segment !== null && subject.trim().length > 0 && body.trim().length > 0 && !isSending;

  async function loadPreview() {
    if (!segment || subject.trim().length === 0 || body.trim().length === 0) return;
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, segment, preview: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Preview failed');
        setPreview(null);
      } else {
        setPreview({
          recipientCount: data.recipientCount,
          sampleEmails: data.sampleEmails ?? [],
        });
      }
    } catch {
      toast.error('Network error while loading preview');
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleSendClick() {
    if (!canSubmit) return;
    setConfirmOpen(true);
  }

  function handleConfirmSend() {
    if (!segment) return;
    startSending(async () => {
      try {
        const res = await fetch('/api/admin/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, body, segment }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? 'Broadcast failed');
          return;
        }
        toast.success(
          `Broadcast sent: ${data.sentCount}/${data.recipientCount} delivered${
            data.failedCount > 0 ? ` (${data.failedCount} failed)` : ''
          }`,
        );
        setPastBroadcasts((prev) => [
          {
            id: data.broadcastId,
            subject,
            segment,
            recipientCount: data.recipientCount,
            sentCount: data.sentCount,
            failedCount: data.failedCount,
            sentBy: 'you',
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setSubject('');
        setBody('');
        setSegment(null);
        setPreview(null);
        setConfirmOpen(false);
      } catch {
        toast.error('Network error while sending');
      }
    });
  }

  const expectedCount = segment !== null ? counts[segment] : 0;

  return (
    <div className="space-y-6">
      {/* Segment picker */}
      <section>
        <h2 className="text-sm font-semibold mb-2">1. Choose a segment</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {SEGMENT_ORDER.map((key) => {
            const info = SEGMENT_LABELS[key];
            const selected = segment === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSegment(key);
                  setPreview(null);
                }}
                className={cn(
                  'text-left rounded-xl border px-4 py-3 transition-colors',
                  selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-card hover:bg-muted/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{info.label}</span>
                  <span
                    className={cn(
                      'text-xs font-semibold rounded-full px-2 py-0.5',
                      selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {counts[key]}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                  {info.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Composer */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">2. Compose</h2>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="subject" className="text-xs font-medium text-muted-foreground">
              Subject
            </label>
            <span
              className={cn(
                'text-[10px]',
                subject.length > 200 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {subject.length}/200
            </span>
          </div>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 200))}
            placeholder="What's new this week?"
            maxLength={200}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="body" className="text-xs font-medium text-muted-foreground">
              Body
            </label>
            <span className="text-[10px] text-muted-foreground">
              HTML is supported · {body.length}/50000
            </span>
          </div>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 50_000))}
            placeholder={'Hi {name},\n\n<p>You can use plain text or simple HTML.</p>'}
            className="min-h-[220px] font-mono text-xs"
          />
        </div>
      </section>

      {/* Preview */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">3. Preview recipients</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canSubmit || previewLoading}
            onClick={loadPreview}
          >
            {previewLoading ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Eye size={14} className="mr-1.5" />
            )}
            Load preview
          </Button>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          {preview ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Users size={14} className="text-muted-foreground" />
                <span>
                  <strong className="font-semibold">{preview.recipientCount}</strong> recipient
                  {preview.recipientCount === 1 ? '' : 's'} will receive this email
                </span>
              </div>
              {preview.sampleEmails.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Sample (first 5)
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {preview.sampleEmails.map((email) => (
                      <li key={email} className="font-mono truncate">
                        {email}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {segment
                ? `About ${expectedCount} recipient${expectedCount === 1 ? '' : 's'}. Click "Load preview" for sample emails.`
                : 'Select a segment and fill in subject + body to preview.'}
            </p>
          )}
        </div>
      </section>

      {/* Send */}
      <section className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={handleSendClick}
        >
          <Send size={14} className="mr-1.5" />
          Send broadcast
        </Button>
      </section>

      {/* Past broadcasts */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Past broadcasts</h2>
        {pastBroadcasts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No broadcasts yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Segment
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Sent
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {pastBroadcasts.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium truncate max-w-[280px]">{b.subject}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                          {SEGMENT_LABELS[b.segment as SegmentKey]?.label ?? b.segment}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="font-semibold text-foreground">{b.sentCount}</span>
                        <span className="text-muted-foreground">/{b.recipientCount}</span>
                        {b.failedCount > 0 && (
                          <span className="ml-1.5 text-destructive">
                            ({b.failedCount} failed)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                        {formatDate(b.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send broadcast?</DialogTitle>
            <DialogDescription>
              Send email to{' '}
              <strong>
                {preview?.recipientCount ?? expectedCount} recipient
                {(preview?.recipientCount ?? expectedCount) === 1 ? '' : 's'}
              </strong>
              {segment && (
                <>
                  {' '}
                  in segment{' '}
                  <strong>{SEGMENT_LABELS[segment].label}</strong>
                </>
              )}
              ? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSending}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSend} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send size={14} className="mr-1.5" />
                  Confirm send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
