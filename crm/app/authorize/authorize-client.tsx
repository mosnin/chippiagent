'use client';

import { useState } from 'react';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle2, Database, FileText, CalendarDays, Users, Loader2 } from 'lucide-react';

interface Props {
  spaceName: string;
  keyName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
}

export function AuthorizeClient({
  spaceName,
  keyName,
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  scope,
}: Props) {
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');

  async function handleApprove() {
    setApproving(true);
    setError('');
    try {
      const res = await fetch('/api/mcp/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          state,
          scope,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Authorization failed');
      }

      const { redirect_url } = await res.json();
      setApproved(true);
      // Show success briefly then redirect
      setTimeout(() => {
        window.location.href = redirect_url;
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setApproving(false);
    }
  }

  function handleDeny() {
    const url = new URL(redirectUri);
    url.searchParams.set('error', 'access_denied');
    if (state) url.searchParams.set('state', state);
    window.location.href = url.toString();
  }

  const permissions = [
    { icon: Users, label: 'View your contacts and leads' },
    { icon: Database, label: 'View your deals and pipeline' },
    { icon: CalendarDays, label: 'View your tours and calendar' },
    { icon: FileText, label: 'View your notes' },
  ];

  if (approved) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex justify-center">
            <BrandLogo className="h-8" alt="Chippi" />
          </div>
          <div className="rounded-2xl bg-card border border-border shadow-lg p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold">Successfully Connected</h1>
              <p className="text-sm text-muted-foreground">
                Claude now has read-only access to your <span className="font-medium text-foreground">{spaceName}</span> workspace.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Redirecting back to Claude...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <BrandLogo className="h-8" alt="Chippi" />
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-card border border-border shadow-lg p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Shield size={24} className="text-primary" />
            </div>
            <h1 className="text-lg font-semibold">Authorize Connection</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Claude</span> wants to connect to your workspace <span className="font-medium text-foreground">{spaceName}</span>
            </p>
          </div>

          {/* Permissions */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">This will allow read-only access to:</p>
            <div className="space-y-1.5">
              {permissions.map((p) => (
                <div key={p.label} className="flex items-center gap-2.5 text-sm">
                  <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                  <span>{p.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Key info */}
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Using key: <span className="font-medium">{keyName}</span>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-full"
              onClick={handleDeny}
              disabled={approving}
            >
              Deny
            </Button>
            <Button
              type="button"
              className="flex-1 rounded-full"
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? <Loader2 size={16} className="animate-spin mr-1" /> : null}
              Authorize
            </Button>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          You can revoke this access anytime from Settings → Integrations
        </p>
      </div>
    </div>
  );
}
