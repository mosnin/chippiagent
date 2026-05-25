'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

type WizardState = 'choose' | 'preview' | 'done';

export interface OffboardMemberDialogMember {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
}

export interface OffboardMemberDialogCandidate {
  id: string;
  name: string | null;
  email: string;
  userStatus?: string;
}

export interface OffboardMemberDialogProps {
  member: OffboardMemberDialogMember;
  otherMembers: OffboardMemberDialogCandidate[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}

interface DryRunResponse {
  dryRun: true;
  contactCount: number;
  dealCount: number;
  openTourCount: number;
  leavingUserName: string;
  destinationUserName: string;
}

interface RealRunResponse {
  dryRun: false;
  contactsMoved: number;
  dealsMoved: number;
  toursMoved: number;
}

interface ErrorResponse {
  error: string;
}

function displayName(m: { name: string | null; email: string }): string {
  return m.name && m.name.trim().length > 0 ? m.name : m.email;
}

export function OffboardMemberDialog({
  member,
  otherMembers,
  open,
  onOpenChange,
  onDone,
}: OffboardMemberDialogProps) {
  const [state, setState] = useState<WizardState>('choose');
  const [destinationMembershipId, setDestinationMembershipId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DryRunResponse | null>(null);
  const [result, setResult] = useState<RealRunResponse | null>(null);

  // Reset local state whenever the dialog is (re)opened for a new member.
  useEffect(() => {
    if (open) {
      setState('choose');
      setDestinationMembershipId('');
      setLoading(false);
      setError(null);
      setPreview(null);
      setResult(null);
    }
  }, [open, member.id]);

  const leavingName = displayName(member);
  const selectedCandidate = otherMembers.find((m) => m.id === destinationMembershipId) ?? null;
  const destinationDisplayName =
    preview?.destinationUserName ??
    (selectedCandidate ? displayName(selectedCandidate) : '');

  async function callOffboard<T>(dryRun: boolean): Promise<T> {
    const res = await fetch(`/api/broker/members/${member.id}/offboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationMembershipId, dryRun }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errData = data as Partial<ErrorResponse>;
      throw new Error(errData.error ?? `Request failed (${res.status}).`);
    }
    return data as T;
  }

  async function handlePreview() {
    if (!destinationMembershipId) {
      setError('Pick a destination member first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await callOffboard<DryRunResponse>(true);
      setPreview(data);
      setState('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!destinationMembershipId) {
      setError('Pick a destination member first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await callOffboard<RealRunResponse>(false);
      setResult(data);
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Offboard failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    onOpenChange(false);
  }

  function handleFinish() {
    onOpenChange(false);
    onDone?.();
  }

  const nothingToTransfer =
    preview !== null &&
    preview.contactCount === 0 &&
    preview.dealCount === 0 &&
    preview.openTourCount === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (loading) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        {state === 'choose' && (
          <>
            <DialogHeader>
              <DialogTitle>Offboard {leavingName}</DialogTitle>
              <DialogDescription>
                Pick which active member should receive this agent&apos;s brokerage
                contacts, deals, and open tours. This is reversible manually but not
                automatic &mdash; pick carefully.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="offboard-destination">Destination member</Label>
              <Select
                value={destinationMembershipId}
                onValueChange={(v) => setDestinationMembershipId(v)}
                disabled={loading}
              >
                <SelectTrigger id="offboard-destination" className="w-full">
                  <SelectValue placeholder="Select a member…" />
                </SelectTrigger>
                <SelectContent>
                  {otherMembers.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No other active members available
                    </SelectItem>
                  ) : (
                    otherMembers.map((m) => {
                      const isActive = (m.userStatus ?? 'active') === 'active';
                      const label = displayName(m);
                      return (
                        <SelectItem key={m.id} value={m.id} disabled={!isActive}>
                          {label}
                          {!isActive ? ' (inactive)' : ''}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handlePreview}
                disabled={loading || !destinationMembershipId}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Previewing…
                  </>
                ) : (
                  <>
                    Preview
                    <ArrowRight size={14} />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {state === 'preview' && preview && (
          <>
            <DialogHeader>
              <DialogTitle>Preview transfer</DialogTitle>
              <DialogDescription>
                Review what will move from{' '}
                <span className="font-medium text-foreground">{preview.leavingUserName}</span>{' '}
                to{' '}
                <span className="font-medium text-foreground">{preview.destinationUserName}</span>
                .
              </DialogDescription>
            </DialogHeader>

            {nothingToTransfer ? (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Nothing to transfer &mdash; this agent has no brokerage-owned data.
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <p className="text-sm">
                  <span className="font-semibold tabular-nums">{preview.contactCount}</span>{' '}
                  brokerage {preview.contactCount === 1 ? 'contact' : 'contacts'} will move
                  to{' '}
                  <span className="font-medium">{preview.destinationUserName}</span>
                </p>
                <p className="text-sm">
                  <span className="font-semibold tabular-nums">{preview.dealCount}</span>{' '}
                  {preview.dealCount === 1 ? 'deal' : 'deals'} will follow them
                </p>
                <p className="text-sm">
                  <span className="font-semibold tabular-nums">{preview.openTourCount}</span>{' '}
                  open {preview.openTourCount === 1 ? 'tour' : 'tours'} will be reassigned
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (loading) return;
                  setError(null);
                  setState('choose');
                }}
                disabled={loading}
              >
                <ArrowLeft size={14} />
                Back
              </Button>
              <Button size="sm" onClick={handleConfirm} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Offboarding…
                  </>
                ) : (
                  'Confirm offboard'
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {state === 'done' && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                Offboarded {leavingName}
              </DialogTitle>
              <DialogDescription>
                <span className="tabular-nums font-medium text-foreground">
                  {result.contactsMoved}
                </span>{' '}
                {result.contactsMoved === 1 ? 'contact' : 'contacts'},{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {result.dealsMoved}
                </span>{' '}
                {result.dealsMoved === 1 ? 'deal' : 'deals'},{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {result.toursMoved}
                </span>{' '}
                {result.toursMoved === 1 ? 'tour' : 'tours'} moved to{' '}
                <span className="font-medium text-foreground">
                  {destinationDisplayName}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button size="sm" onClick={handleFinish}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
