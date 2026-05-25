'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Space } from '@/lib/types';
import {
  BODY_MUTED,
  CAPTION,
  FIELD_RHYTHM,
  PRIMARY_PILL,
} from '@/lib/typography';

interface GeneralSettingsFormProps {
  space: Space;
  settings: {
    phoneNumber?: string | null;
  } | null;
}

export function DangerZone({ space }: { space: Space }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${space.name}"? Every client, deal, and note goes with it. I can't bring it back.`,
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: space.slug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Couldn't delete the workspace. Try again.");
        return;
      }
      router.push('/');
    } catch {
      alert("I lost the connection. Check it and try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className={BODY_MUTED}>
        Deleting your space is permanent. Every client, deal, and note goes with it. I can&apos;t bring it back.
      </p>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium',
          'bg-destructive text-white hover:bg-destructive/90 active:scale-[0.98] transition-all duration-150',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
      >
        {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {deleting ? 'Deleting' : 'Delete space'}
      </button>
    </div>
  );
}

export function GeneralSettingsForm({ space, settings }: GeneralSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(space.name);
  const [newSlug, setNewSlug] = useState(space.slug);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(settings?.phoneNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const checkSlug = useCallback(
    async (value: string) => {
      if (value === space.slug) {
        setSlugAvailable(null);
        return;
      }
      if (value.length < 3) {
        setSlugAvailable(null);
        return;
      }
      setCheckingSlug(true);
      try {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_slug', slug: value }),
        });
        const data = await res.json();
        setSlugAvailable(data.available);
      } finally {
        setCheckingSlug(false);
      }
    },
    [space.slug],
  );

  useEffect(() => {
    const timer = setTimeout(() => checkSlug(newSlug), 400);
    return () => clearTimeout(timer);
  }, [newSlug, checkSlug]);

  const slugChanged = newSlug !== space.slug;
  const slugValid = !slugChanged || (slugChanged && newSlug.length >= 3 && slugAvailable === true);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: space.slug,
          newSlug: slugChanged ? newSlug : undefined,
          name,
          phoneNumber,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setSlugAvailable(false);
          setSaveError('That slug was just taken. Pick a different one.');
          return;
        }
        setSaveError(data.error || "Couldn't save those settings. Try again.");
        return;
      }
      const updated = await res.json().catch(() => ({}));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      if (slugChanged && updated.slug) {
        router.replace(`/s/${updated.slug}/settings`);
      } else {
        router.refresh();
      }
    } catch {
      setSaveError('Network hiccup. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      <div className={FIELD_RHYTHM}>
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-[12.5px] font-medium text-foreground">
            Workspace name
          </Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug" className="text-[12.5px] font-medium text-foreground">
            Slug
          </Label>
          <div className="relative">
            <Input
              id="slug"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="pr-16"
            />
            {slugChanged && newSlug.length >= 3 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingSlug ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                ) : slugAvailable === true ? (
                  <CheckCircle2 size={14} className="text-foreground" />
                ) : slugAvailable === false ? (
                  <span className="text-xs font-medium text-destructive">taken</span>
                ) : null}
              </div>
            )}
          </div>
          <p className={CAPTION}>Your intake link: chippi.com/apply/{newSlug}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="number" className="text-[12.5px] font-medium text-foreground">
            Phone number
          </Label>
          <Input
            id="number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="(555) 123-4567"
          />
          <p className={CAPTION}>Used for SMS notifications and shown on tour booking pages.</p>
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !slugValid}
            className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving' : saved ? 'Saved' : 'Save changes'}
          </button>
          {saved && <p className={BODY_MUTED}>Changes saved.</p>}
        </div>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      </div>
    </form>
  );
}
