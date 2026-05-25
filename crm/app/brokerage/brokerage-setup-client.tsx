'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Hash,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Users,
  BarChart3,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand-logo';

interface BrokerageSetupClientProps {
  spaceSlug: string;
  existingBrokerageName: string | null;
  existingBrokerageId: string | null;
}

function CreateForm() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/broker/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = '/broker';
      } else {
        setError(data.error ?? 'Failed to create brokerage.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleCreate} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Brokerage name
        </label>
        <input
          type="text"
          required
          placeholder="e.g. Preston Realty Group"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
        {loading ? 'Creating…' : 'Create brokerage'}
        {!loading && <ArrowRight size={15} className="ml-2" />}
      </Button>
    </form>
  );
}

function JoinForm() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState<string | null>(null);

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
        setTimeout(() => (window.location.href = '/setup'), 1500);
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
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 py-2">
        <CheckCircle2 size={16} />
        <p className="text-sm font-medium">Joined {joined}! Redirecting…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleJoin} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Invite code
        </label>
        <input
          type="text"
          required
          placeholder="ABCD-EF23"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={9}
          className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Ask your broker for the 8-character code from their dashboard.
        </p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
        {loading ? 'Joining…' : 'Join brokerage'}
        {!loading && <ArrowRight size={15} className="ml-2" />}
      </Button>
    </form>
  );
}

export function BrokerageSetupClient({
  spaceSlug,
  existingBrokerageName,
}: BrokerageSetupClientProps) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');

  // Already part of a brokerage
  if (existingBrokerageName) {
    return (
      <div className="app-theme min-h-screen bg-background flex flex-col">
        <header className="px-6 py-5 border-b border-border">
          <Link href="/" aria-label="Chippi home">
            <BrandLogo className="h-6 w-auto" alt="Chippi" />
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-md text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Building2 size={26} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">You&apos;re already set up</h1>
            <p className="mt-3 text-muted-foreground">
              You&apos;re a member of{' '}
              <span className="font-semibold text-foreground">{existingBrokerageName}</span>.
            </p>

            <div className="mt-8 flex flex-col gap-3">
              <Link href={`/s/${spaceSlug}`}>
                <Button className="w-full gap-2">
                  <ArrowLeft size={15} />
                  Back to my workspace
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-theme min-h-screen bg-background flex flex-col">
      <header className="px-6 py-5 border-b border-border flex items-center justify-between">
        <Link href="/" aria-label="Chippi home">
          <BrandLogo className="h-6 w-auto" alt="Chippi" />
        </Link>
        <Link
          href={`/s/${spaceSlug}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to workspace
        </Link>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-4xl">
          {/* Page header */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary mb-4">
              <Building2 size={11} />
              Brokerage
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Set up your brokerage</h1>
            <p className="mt-2 text-muted-foreground">
              Create your own brokerage to manage a team of realtors, or join one with a code from your broker.
            </p>
          </div>

          {mode === 'choose' && (
            <div className="grid md:grid-cols-2 gap-5">
              {/* Create card */}
              <button
                onClick={() => setMode('create')}
                className="group text-left rounded-2xl border border-border bg-card p-7 hover:border-primary/40 hover:shadow-[0_4px_24px_-8px_rgba(13,148,136,0.2)] transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                  <Building2 size={20} className="text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Create a brokerage</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                  Start your own brokerage. Invite realtors to join, manage their leads, and get team-wide visibility from a central broker dashboard.
                </p>
                <div className="space-y-2 mb-6">
                  {[
                    { icon: Users, label: 'Invite realtors via email or share code' },
                    { icon: BarChart3, label: 'Team-wide lead and pipeline analytics' },
                    { icon: Mail, label: 'Manage brokerage invitations' },
                  ].map((f) => (
                    <div key={f.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <f.icon size={13} className="text-primary flex-shrink-0" />
                      {f.label}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all">
                  Create a brokerage <ArrowRight size={14} />
                </div>
              </button>

              {/* Join card */}
              <button
                onClick={() => setMode('join')}
                className="group text-left rounded-2xl border border-border bg-card p-7 hover:border-primary/40 hover:shadow-[0_4px_24px_-8px_rgba(13,148,136,0.2)] transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                  <Hash size={20} className="text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Join a brokerage</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                  Enter the invite code your broker shared with you. You&apos;ll keep your own workspace, leads, and pipeline — this just connects you to the brokerage network.
                </p>
                <div className="space-y-2 mb-6">
                  {[
                    { icon: CheckCircle2, label: 'Your workspace and data stay separate' },
                    { icon: CheckCircle2, label: 'Your broker gets team-level visibility' },
                    { icon: CheckCircle2, label: 'Works instantly with an 8-character code' },
                  ].map((f) => (
                    <div key={f.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <f.icon size={13} className="text-primary flex-shrink-0" />
                      {f.label}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all">
                  Join with a code <ArrowRight size={14} />
                </div>
              </button>
            </div>
          )}

          {mode === 'create' && (
            <div className="max-w-md">
              <button
                onClick={() => setMode('choose')}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <div className="rounded-2xl border border-border bg-card p-7">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <Building2 size={20} className="text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-1">Create a brokerage</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Give your brokerage a name. You can invite realtors after it&apos;s created.
                </p>
                <CreateForm />
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="max-w-md">
              <button
                onClick={() => setMode('choose')}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <div className="rounded-2xl border border-border bg-card p-7">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <Hash size={20} className="text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-1">Join a brokerage</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Enter the code from your broker&apos;s dashboard. It looks like{' '}
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">ABCD-EF23</code>.
                </p>
                <JoinForm />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
