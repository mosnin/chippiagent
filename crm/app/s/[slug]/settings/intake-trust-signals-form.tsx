'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BODY_MUTED,
  CAPTION,
  FIELD_RHYTHM,
  PRIMARY_PILL,
} from '@/lib/typography';

interface IntakeTrustSignalsFormProps {
  slug: string;
  licenseNumber: string;
  fairHousingNotice: string;
  showEqualHousingMark: boolean;
}

const FAIR_HOUSING_PLACEHOLDER =
  'Equal Housing Opportunity. We do not discriminate on the basis of race, color, religion, national origin, sex, familial status, or disability.';

/**
 * Compliance & trust signals — three optional fields rendered in the public
 * intake-page footer. Same PATCH /api/spaces endpoint as the rest of the
 * workspace settings; no new API surface.
 */
export function IntakeTrustSignalsForm({
  slug,
  licenseNumber: initialLicense,
  fairHousingNotice: initialNotice,
  showEqualHousingMark: initialShow,
}: IntakeTrustSignalsFormProps) {
  const router = useRouter();
  const [licenseNumber, setLicenseNumber] = useState(initialLicense);
  const [fairHousingNotice, setFairHousingNotice] = useState(initialNotice);
  const [showEqualHousingMark, setShowEqualHousingMark] = useState(initialShow);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          intakeLicenseNumber: licenseNumber.trim(),
          intakeFairHousingNotice: fairHousingNotice,
          intakeShowEqualHousingMark: showEqualHousingMark,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Couldn't save. Try again.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch {
      setSaveError('Network hiccup. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <p className={BODY_MUTED}>
        These show on your /apply intake-form footer for legal compliance.
      </p>

      <div className={FIELD_RHYTHM}>
        <div className="space-y-1.5">
          <Label htmlFor="intakeLicenseNumber" className="text-[12.5px] font-medium text-foreground">
            License number
          </Label>
          <Input
            id="intakeLicenseNumber"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="TX-RE-12345"
            maxLength={120}
          />
          <p className={CAPTION}>Your real-estate license number, shown verbatim in the footer.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="intakeFairHousingNotice" className="text-[12.5px] font-medium text-foreground">
            Fair Housing notice
          </Label>
          <Textarea
            id="intakeFairHousingNotice"
            value={fairHousingNotice}
            onChange={(e) => setFairHousingNotice(e.target.value)}
            placeholder={FAIR_HOUSING_PLACEHOLDER}
            rows={4}
            maxLength={2000}
          />
          <p className={CAPTION}>Plain text. Line breaks are preserved.</p>
        </div>

        <div className="flex items-start gap-3 pt-1">
          <Switch
            id="intakeShowEqualHousingMark"
            checked={showEqualHousingMark}
            onCheckedChange={setShowEqualHousingMark}
          />
          <div className="space-y-0.5">
            <Label htmlFor="intakeShowEqualHousingMark" className="text-[12.5px] font-medium text-foreground cursor-pointer">
              Show Equal Housing mark
            </Label>
            <p className={CAPTION}>Displays the standard Equal Housing Opportunity logo next to the notice.</p>
          </div>
        </div>
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
