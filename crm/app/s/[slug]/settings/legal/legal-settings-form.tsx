'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
} from '@/lib/typography';

interface LegalSettingsFormProps {
  slug: string;
  privacyPolicyUrl: string;
}

function isValidHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Privacy policy URL — the one legal field that has to exist for the intake
 * form to legally collect submissions. The "custom consent label" knob was
 * dropped: the default ("I agree to [Business Name]'s Privacy Policy") is
 * the right copy 99% of the time, and the 1% can edit their hosted policy.
 */
export function LegalSettingsForm({
  slug,
  privacyPolicyUrl: initialUrl,
}: LegalSettingsFormProps) {
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState(initialUrl);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [urlError, setUrlError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setUrlError('');
    setSaveError('');

    const trimmedUrl = privacyPolicyUrl.trim();
    if (trimmedUrl && !isValidHttpsUrl(trimmedUrl)) {
      setUrlError('URL must start with https:// and be valid.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          privacyPolicyUrl: trimmedUrl || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Couldn't save. Try again.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Network hiccup. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <p className={BODY_MUTED}>
        Required before your intake form can collect submissions.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="privacyPolicyUrl" className="text-[12.5px] font-medium text-foreground">
          Privacy policy URL
        </Label>
        <Input
          id="privacyPolicyUrl"
          type="url"
          placeholder="https://yourdomain.com/privacy"
          value={privacyPolicyUrl}
          onChange={(e) => {
            setPrivacyPolicyUrl(e.target.value);
            setUrlError('');
          }}
          className={urlError ? 'border-destructive' : ''}
        />
        {urlError && <p className="text-xs text-destructive">{urlError}</p>}
        <p className={CAPTION}>Linked from the consent checkbox on your intake form.</p>
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving' : 'Save changes'}
        </button>
        {saved && (
          <span className={`inline-flex items-center gap-1.5 ${BODY_MUTED}`}>
            <CheckCircle2 size={14} className="text-foreground" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
