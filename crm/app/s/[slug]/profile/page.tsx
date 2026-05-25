'use client';

// This page uses client-side Clerk hooks for profile management
import { useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserButton } from '@clerk/nextjs';
import { Link2, ArrowUpRight, ExternalLink } from 'lucide-react';
import { buildIntakeUrl } from '@/lib/intake';
import { CopyLinkButton } from '../copy-link-button';
import { H1, TITLE_FONT } from '@/lib/typography';

export default function ProfilePage() {
  const params = useParams<{ slug: string }>();
  const { user, isLoaded } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync state from Clerk user once loaded
  useEffect(() => {
    if (isLoaded && user && !initialized) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setInitialized(true);
    }
  }, [isLoaded, user, initialized]);

  if (!isLoaded || !initialized) {
    return (
      <div className="space-y-4 max-w-3xl animate-pulse">
        <div className="h-8 bg-muted rounded-lg w-32" />
        <div className="h-40 bg-muted rounded-lg" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  if (!user) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      try {
        await user!.update({ firstName, lastName });
      } catch (clerkErr) {
        // Clerk v7+ may reject first_name/last_name on certain API versions.
        console.warn('[profile] Clerk user.update() failed:', clerkErr);
      }
      // Also persist name to the DB so the app always has the latest value
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_profile', name: `${firstName} ${lastName}`.trim() }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const initials = [user.firstName?.[0], user.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() || 'U';

  const slug = params?.slug;
  const applicationUrl = slug ? buildIntakeUrl(slug) : '';

  return (
    <div className="space-y-5 max-w-3xl">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Profile.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Your account
        </h1>
        <p className="text-sm text-muted-foreground">Name, intake link, and public-facing details.</p>
      </header>

      {/* Intake link card */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center gap-2">
          <Link2 size={14} className="text-primary" />
          <p className="font-semibold text-sm">Public application link</p>
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-[10px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Live
          </span>
        </div>
        <div className="px-6 py-5 space-y-3">
          <code className="block text-xs bg-muted border border-border rounded-lg px-3 py-2.5 break-all text-muted-foreground">
            {applicationUrl}
          </code>
          <div className="flex items-center gap-2">
            <CopyLinkButton url={applicationUrl} />
            <Button asChild variant="outline" size="sm">
              <Link href={applicationUrl} target="_blank" rel="noreferrer">
                Open <ExternalLink size={12} className="ml-1.5" />
              </Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Share this link so new renter applications flow directly into your Leads view.
          </p>
        </div>
      </div>

      {/* Account info */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/40">
          <p className="font-semibold text-sm">Your account</p>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 ring-2 ring-border">
              <AvatarImage src={user.imageUrl} />
              <AvatarFallback className="text-base font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">
                {user.fullName ?? user.emailAddresses[0]?.emailAddress}
              </p>
              <p className="text-sm text-muted-foreground">
                {user.emailAddresses[0]?.emailAddress}
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user.emailAddresses[0]?.emailAddress ?? ''} disabled />
              <p className="text-xs text-muted-foreground">Email is managed via your Clerk account.</p>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving' : saved ? 'Saved.' : 'Save changes'}
              </Button>
              {saved && <p className="text-sm text-primary">Changes saved.</p>}
            </div>
          </form>
        </div>
      </div>

      {/* Account management */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/40">
          <p className="font-semibold text-sm">Account management</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground mb-4">
            Manage your avatar, password, and connected accounts.
          </p>
          <UserButton />
        </div>
      </div>
    </div>
  );
}
