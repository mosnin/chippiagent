'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toastCopied } from '@/lib/toast-helpers';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Copy,
  Check,
  KeyRound,
  RefreshCw,
  Wrench,
  ExternalLink,
  CreditCard,
  Gift,
  Clock,
  DollarSign,
  ShieldBan,
  ShieldCheck,
  LogIn,
  Lock,
  Monitor,
  Smartphone,
  Trash2,
  ShieldAlert,
  MailWarning,
  X,
} from 'lucide-react';

interface ActiveSession {
  id: string;
  lastActiveAt: number;
  createdAt: number;
  expireAt: number;
  clientId: string;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  browserName: string | null;
  deviceType: string | null;
}

interface UserActionsProps {
  userId: string;
  clerkId: string;
  email: string;
  isOnboarded: boolean;
  hasSpace: boolean;
  intakeUrl: string | null;
  subscriptionStatus: string | null;
  stripePeriodEnd: string | null;
  isSuspended: boolean;
  twoFactorEnabled: boolean;
  totpEnabled: boolean;
  backupCodeEnabled: boolean;
  activeSessions: ActiveSession[];
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toastCopied('Copied!');
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="text-xs gap-1.5"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : label}
    </Button>
  );
}

const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'inactive'] as const;

export function UserActions({
  userId,
  clerkId,
  email,
  isOnboarded,
  hasSpace,
  intakeUrl,
  subscriptionStatus,
  stripePeriodEnd,
  isSuspended: isSuspendedInitial,
  twoFactorEnabled,
  totpEnabled,
  backupCodeEnabled,
  activeSessions,
}: UserActionsProps) {
  const router = useRouter();
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [subStatus, setSubStatus] = useState(subscriptionStatus || 'inactive');
  const [subLoading, setSubLoading] = useState(false);
  const [subResult, setSubResult] = useState<string | null>(null);
  const [suspended, setSuspended] = useState(isSuspendedInitial);
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [suspendResult, setSuspendResult] = useState<string | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [compLoading, setCompLoading] = useState(false);
  const [compResult, setCompResult] = useState<string | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundResult, setRefundResult] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [sessions, setSessions] = useState<ActiveSession[]>(activeSessions);
  const [sessionBusy, setSessionBusy] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<string | null>(null);
  const [revokeAllLoading, setRevokeAllLoading] = useState(false);
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonateResult, setImpersonateResult] = useState<string | null>(null);
  const [forceResetOpen, setForceResetOpen] = useState(false);
  const [forceResetLoading, setForceResetLoading] = useState(false);
  const [forceResetResult, setForceResetResult] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaResult, setMfaResult] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState(14);

  async function handlePasswordReset() {
    setResetLoading(true);
    setResetResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_password_reset', clerkId }),
      });
      const data = await res.json();
      if (res.ok) {
        setResetResult('Password reset email sent.');
      } else {
        setResetResult(data.error || 'Failed to send reset email.');
      }
    } catch {
      setResetResult('Network error. Try again.');
    } finally {
      setResetLoading(false);
    }
  }

  async function handleRepairOnboarding() {
    setRepairLoading(true);
    setRepairResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'repair_onboarding', userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRepairResult(data.message || 'Onboarding state repaired.');
        setRepairOpen(false);
        router.refresh();
      } else {
        setRepairResult(data.error || 'Repair failed.');
      }
    } catch {
      setRepairResult('Network error. Try again.');
    } finally {
      setRepairLoading(false);
    }
  }

  async function handleUpdateSubscription(status: string, periodEnd?: string) {
    setSubLoading(true);
    setSubResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_subscription',
          userId,
          status,
          ...(periodEnd ? { periodEnd } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubResult(data.message || 'Subscription updated.');
        router.refresh();
      } else {
        setSubResult(data.error || 'Failed to update subscription.');
      }
    } catch {
      setSubResult('Network error. Try again.');
    } finally {
      setSubLoading(false);
    }
  }

  function handleCompAccount() {
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    handleUpdateSubscription('active', oneYearFromNow.toISOString());
  }

  function handleExtendTrial() {
    const days = Math.max(1, Math.min(365, trialDays || 14));
    const end = new Date();
    end.setDate(end.getDate() + days);
    handleUpdateSubscription('trialing', end.toISOString());
  }

  async function handleCompFreeMonth() {
    setCompLoading(true);
    setCompResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'comp_free_month', userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setCompResult(`Free month granted. Active until ${new Date(data.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`);
        router.refresh();
      } else {
        setCompResult(data.error || 'Failed to comp free month.');
      }
    } catch {
      setCompResult('Network error. Try again.');
    } finally {
      setCompLoading(false);
    }
  }

  async function handleRefund() {
    setRefundLoading(true);
    setRefundResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue_refund', userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRefundResult(`Refund issued. Refund ID: ${data.refundId}, Amount: $${(data.amount / 100).toFixed(2)}.`);
        setRefundOpen(false);
        router.refresh();
      } else {
        setRefundResult(data.error || 'Refund failed.');
      }
    } catch {
      setRefundResult('Network error. Try again.');
    } finally {
      setRefundLoading(false);
    }
  }

  async function handleImpersonate() {
    setImpersonateLoading(true);
    setImpersonateResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'impersonate_user', clerkId }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        try { await navigator.clipboard.writeText(data.url); } catch { /* clipboard may be blocked */ }
        window.open(data.url, '_blank', 'noopener,noreferrer');
        setImpersonateResult('Sign-in link copied to clipboard and opened in a new tab.');
      } else {
        setImpersonateResult(data.error || 'Failed to create sign-in link.');
      }
    } catch {
      setImpersonateResult('Network error. Try again.');
    } finally {
      setImpersonateLoading(false);
    }
  }

  async function handleForcePasswordReset() {
    setForceResetLoading(true);
    setForceResetResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_password_reset', clerkId }),
      });
      const data = await res.json();
      if (res.ok) {
        setForceResetResult(data.message || 'Password reset forced.');
        setSessions([]);
        setForceResetOpen(false);
        router.refresh();
      } else {
        setForceResetResult(data.error || 'Failed to force reset.');
      }
    } catch {
      setForceResetResult('Network error. Try again.');
    } finally {
      setForceResetLoading(false);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    setSessionBusy(sessionId);
    setSessionResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke_session', sessionId, clerkId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setSessionResult('Session revoked.');
      } else {
        setSessionResult(data.error || 'Failed to revoke session.');
      }
    } catch {
      setSessionResult('Network error. Try again.');
    } finally {
      setSessionBusy(null);
    }
  }

  async function handleRevokeAllSessions() {
    setRevokeAllLoading(true);
    setSessionResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke_all_sessions', clerkId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSessions([]);
        setSessionResult(data.message || 'All sessions revoked.');
      } else {
        setSessionResult(data.error || 'Failed to revoke sessions.');
      }
    } catch {
      setSessionResult('Network error. Try again.');
    } finally {
      setRevokeAllLoading(false);
    }
  }

  async function handleSendMfaPrompt() {
    setMfaLoading(true);
    setMfaResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_mfa_prompt', clerkId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMfaResult(data.message || 'MFA enrollment email sent.');
      } else {
        setMfaResult(data.error || 'Failed to send email.');
      }
    } catch {
      setMfaResult('Network error. Try again.');
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleSuspendToggle() {
    setSuspendLoading(true);
    setSuspendResult(null);
    const action = suspended ? 'unsuspend_user' : 'suspend_user';
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuspendResult(data.message || (suspended ? 'User unsuspended.' : 'User suspended.'));
        setSuspended(!suspended);
        setSuspendOpen(false);
        router.refresh();
      } else {
        setSuspendResult(data.error || 'Action failed.');
      }
    } catch {
      setSuspendResult('Network error. Try again.');
    } finally {
      setSuspendLoading(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold mb-3">Support actions</p>
      <Card>
        <CardContent className="px-5 py-4 space-y-4">
          {/* Copy actions */}
          <div className="flex flex-wrap gap-2">
            <CopyButton text={userId} label="Copy user ID" />
            <CopyButton text={clerkId} label="Copy Clerk ID" />
            <CopyButton text={email} label="Copy email" />
            {intakeUrl && (
              <>
                <CopyButton text={intakeUrl} label="Copy intake URL" />
                <a
                  href={intakeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border bg-card hover:bg-muted transition-colors"
                >
                  <ExternalLink size={13} />
                  Open intake page
                </a>
              </>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Password reset */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Password reset</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send a password reset email via Clerk
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePasswordReset}
              disabled={resetLoading}
              className="text-xs gap-1.5 flex-shrink-0"
            >
              <KeyRound size={13} />
              {resetLoading ? 'Sending...' : 'Send reset email'}
            </Button>
          </div>
          {resetResult && (
            <p className="text-xs text-muted-foreground">{resetResult}</p>
          )}

          <div className="border-t border-border" />

          {/* Repair onboarding */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Repair onboarding state</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isOnboarded && hasSpace
                  ? 'User state looks healthy.'
                  : isOnboarded && !hasSpace
                    ? 'User is onboarded but has no workspace. Repair will reset to re-onboard.'
                    : !isOnboarded && hasSpace
                      ? 'User has a workspace but is not marked as onboarded. Repair will backfill.'
                      : 'User has not completed onboarding.'}
              </p>
            </div>
            <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 flex-shrink-0"
                >
                  <Wrench size={13} />
                  Repair state
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Repair onboarding state</DialogTitle>
                  <DialogDescription>
                    This will analyze the user&apos;s current state and apply the
                    appropriate fix:
                    <br />
                    <br />
                    {!isOnboarded && hasSpace ? (
                      <span className="font-medium">
                        Backfill: Set onboard=true since workspace exists.
                      </span>
                    ) : isOnboarded && !hasSpace ? (
                      <span className="font-medium">
                        Reset: Set onboard=false and onboardingCurrentStep=1 since
                        workspace is missing.
                      </span>
                    ) : (
                      <span className="font-medium">
                        Re-evaluate state and apply any needed correction.
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setRepairOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleRepairOnboarding} disabled={repairLoading}>
                    <RefreshCw
                      size={14}
                      className={repairLoading ? 'animate-spin' : ''}
                    />
                    {repairLoading ? 'Repairing...' : 'Confirm repair'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {repairResult && (
            <p className="text-xs text-muted-foreground">{repairResult}</p>
          )}

          {hasSpace && (
            <>
              <div className="border-t border-border" />

              {/* Subscription management */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <CreditCard size={13} />
                    Subscription
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Current status: <span className="font-medium">{subscriptionStatus || 'inactive'}</span>
                    {stripePeriodEnd && (
                      <> &middot; Period end: {new Date(stripePeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={subStatus}
                    onChange={(e) => setSubStatus(e.target.value)}
                    disabled={subLoading}
                    className="text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {SUBSCRIPTION_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUpdateSubscription(subStatus)}
                    disabled={subLoading}
                    className="text-xs gap-1.5"
                  >
                    <RefreshCw size={13} className={subLoading ? 'animate-spin' : ''} />
                    Set status
                  </Button>

                  <div className="w-px h-5 bg-border" />

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCompAccount}
                    disabled={subLoading}
                    className="text-xs gap-1.5"
                  >
                    <Gift size={13} />
                    Comp account (1 yr)
                  </Button>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={trialDays}
                      onChange={(e) => setTrialDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                      disabled={subLoading}
                      className="w-16 text-xs rounded-md border border-border bg-card px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label="Trial days"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExtendTrial}
                      disabled={subLoading}
                      className="text-xs gap-1.5"
                    >
                      <Clock size={13} />
                      Extend trial
                    </Button>
                  </div>
                </div>
              </div>

              {subResult && (
                <p className="text-xs text-muted-foreground">{subResult}</p>
              )}

              <div className="border-t border-border" />

              {/* Billing actions */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <DollarSign size={13} />
                    Billing
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Comp a free month or issue a refund for the last payment.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleCompFreeMonth}
                    variant="outline"
                    size="sm"
                    disabled={compLoading}
                    className="gap-1.5"
                  >
                    <Gift size={14} />
                    {compLoading ? 'Processing...' : 'Comp free month'}
                  </Button>

                  <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive"
                      >
                        <CreditCard size={14} />
                        Issue refund
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Issue refund</DialogTitle>
                        <DialogDescription>
                          Refund the user&apos;s last payment? This will issue a full refund via Stripe.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setRefundOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleRefund}
                          disabled={refundLoading}
                        >
                          <CreditCard size={14} />
                          {refundLoading ? 'Processing...' : 'Confirm refund'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {compResult && (
                <p className="text-xs text-muted-foreground">{compResult}</p>
              )}
              {refundResult && (
                <p className="text-xs text-muted-foreground">{refundResult}</p>
              )}
            </>
          )}

          <div className="border-t border-border" />

          {/* Account suspension */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <ShieldBan size={13} />
                Account suspension
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {suspended
                  ? 'This account is currently suspended. The user cannot sign in.'
                  : 'Suspend this account to prevent the user from signing in.'}
              </p>
            </div>
            <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
              <DialogTrigger asChild>
                <Button
                  variant={suspended ? 'outline' : 'destructive'}
                  size="sm"
                  className="text-xs gap-1.5 flex-shrink-0"
                >
                  {suspended ? (
                    <>
                      <ShieldCheck size={13} />
                      Unsuspend account
                    </>
                  ) : (
                    <>
                      <ShieldBan size={13} />
                      Suspend account
                    </>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {suspended ? 'Unsuspend account' : 'Suspend account'}
                  </DialogTitle>
                  <DialogDescription>
                    {suspended ? (
                      <>
                        This will restore access for <strong>{email}</strong>. They
                        will be able to sign in again immediately.
                      </>
                    ) : (
                      <>
                        This will immediately prevent <strong>{email}</strong> from
                        signing in. Any active sessions will be invalidated. You can
                        unsuspend the account later.
                      </>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setSuspendOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant={suspended ? 'default' : 'destructive'}
                    onClick={handleSuspendToggle}
                    disabled={suspendLoading}
                  >
                    {suspended ? (
                      <>
                        <ShieldCheck size={14} />
                        {suspendLoading ? 'Unsuspending...' : 'Confirm unsuspend'}
                      </>
                    ) : (
                      <>
                        <ShieldBan size={14} />
                        {suspendLoading ? 'Suspending...' : 'Confirm suspend'}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {suspendResult && (
            <p className="text-xs text-muted-foreground">{suspendResult}</p>
          )}

          <div className="border-t border-border" />

          {/* Active sessions */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Monitor size={13} />
                  Active sessions
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sessions.length === 0
                    ? 'No active sessions for this user.'
                    : `${sessions.length} active session${sessions.length === 1 ? '' : 's'}.`}
                </p>
              </div>
              {sessions.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevokeAllSessions}
                  disabled={revokeAllLoading}
                  className="text-xs gap-1.5 flex-shrink-0 text-destructive hover:text-destructive"
                >
                  <Trash2 size={13} />
                  {revokeAllLoading ? 'Revoking...' : 'Revoke all'}
                </Button>
              )}
            </div>

            {sessions.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {sessions.map((s) => {
                  const DeviceIcon = s.deviceType === 'mobile' ? Smartphone : Monitor;
                  const location = [s.city, s.country].filter(Boolean).join(', ');
                  return (
                    <div key={s.id} className="flex items-start gap-3 px-3 py-2.5">
                      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                        <DeviceIcon size={13} className="text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">
                          {s.browserName || 'Unknown browser'}
                          {s.deviceType ? ` · ${s.deviceType}` : ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {s.ipAddress || 'IP unknown'}
                          {location ? ` · ${location}` : ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Last active {formatRelative(s.lastActiveAt)} · session{' '}
                          <span className="font-mono">{s.id.slice(0, 10)}…</span>
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevokeSession(s.id)}
                        disabled={sessionBusy === s.id}
                        className="text-[11px] h-7 gap-1 flex-shrink-0 text-destructive hover:text-destructive"
                      >
                        <X size={12} />
                        {sessionBusy === s.id ? 'Revoking...' : 'Revoke'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {sessionResult && (
              <p className="text-xs text-muted-foreground">{sessionResult}</p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Security (MFA + force reset + impersonate) */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <ShieldAlert size={13} />
                Security
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span
                  className={
                    'inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ' +
                    (twoFactorEnabled
                      ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                      : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15')
                  }
                >
                  <ShieldCheck size={11} />
                  2FA {twoFactorEnabled ? 'enabled' : 'disabled'}
                </span>
                {totpEnabled && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 text-muted-foreground bg-muted">
                    TOTP
                  </span>
                )}
                {backupCodeEnabled && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 text-muted-foreground bg-muted">
                    Backup codes
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendMfaPrompt}
                disabled={mfaLoading}
                className="text-xs gap-1.5"
              >
                <MailWarning size={13} />
                {mfaLoading ? 'Sending...' : 'Send MFA prompt'}
              </Button>

              <Dialog open={forceResetOpen} onOpenChange={setForceResetOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Lock size={13} />
                    Force password reset
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Force password reset</DialogTitle>
                    <DialogDescription>
                      This will revoke all active sessions for <strong>{email}</strong> and
                      flag their account so they must use the &quot;Forgot password&quot; flow
                      to sign in again. Continue?
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setForceResetOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleForcePasswordReset}
                      disabled={forceResetLoading}
                    >
                      <Lock size={14} />
                      {forceResetLoading ? 'Forcing...' : 'Confirm force reset'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                size="sm"
                onClick={handleImpersonate}
                disabled={impersonateLoading}
                className="text-xs gap-1.5"
              >
                <LogIn size={13} />
                {impersonateLoading ? 'Creating link...' : 'Sign in as user'}
              </Button>
            </div>

            {mfaResult && (
              <p className="text-xs text-muted-foreground">{mfaResult}</p>
            )}
            {forceResetResult && (
              <p className="text-xs text-muted-foreground">{forceResetResult}</p>
            )}
            {impersonateResult && (
              <p className="text-xs text-muted-foreground">{impersonateResult}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
