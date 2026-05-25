'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  SECTION_LABEL,
  BODY_MUTED,
  CAPTION,
} from '@/lib/typography';
import type { AIUserProfile } from '@/lib/swarm-types';
import {
  BUSINESS_FOCUS_OPTIONS,
  WORKING_STYLE_OPTIONS,
  COMMUNICATION_TONE_OPTIONS,
} from '@/lib/swarm-types';

interface AIProfileFormProps {
  slug: string;
  spaceId: string;
}

type PartialProfile = Omit<AIUserProfile, 'id' | 'spaceId' | 'createdAt' | 'updatedAt'>;

const EMPTY_PROFILE: PartialProfile = {
  displayName: null,
  businessFocus: [],
  yearsExperience: null,
  workingStyle: null,
  communicationTone: null,
  currentGoals: null,
  quirksAndPreferences: null,
  agentPersonalizationNote: null,
  role: null,
  zipCode: null,
  leadSources: [],
};

export function AIProfileForm({ slug: _slug, spaceId }: AIProfileFormProps) {
  const [profile, setProfile] = useState<PartialProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);

  // Debounce timer ref for chip toggles
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------
  // Load on mount
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!spaceId) return;
    fetch(`/api/ai-profile?spaceId=${encodeURIComponent(spaceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AIUserProfile | null) => {
        if (data) {
          setProfile({
            displayName: data.displayName,
            businessFocus: data.businessFocus ?? [],
            yearsExperience: data.yearsExperience,
            workingStyle: data.workingStyle,
            communicationTone: data.communicationTone,
            currentGoals: data.currentGoals,
            quirksAndPreferences: data.quirksAndPreferences,
            agentPersonalizationNote: data.agentPersonalizationNote,
            role: data.role ?? null,
            zipCode: data.zipCode ?? null,
            leadSources: data.leadSources ?? [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [spaceId]);

  // -----------------------------------------------------------------
  // Save helpers
  // -----------------------------------------------------------------
  const save = useCallback(
    async (latest: PartialProfile) => {
      try {
        const res = await fetch('/api/ai-profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spaceId, ...latest }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error || 'Could not save.');
        }
        toast.success('AI profile saved.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'That tripped me up. Try again.');
      }
    },
    [spaceId],
  );

  /** Called on text field blur — save immediately. */
  const saveOnBlur = useCallback(
    (latest: PartialProfile) => {
      save(latest);
    },
    [save],
  );

  /** Called on chip toggle — debounce 500 ms so rapid multi-select is batched. */
  const saveDebounced = useCallback(
    (latest: PartialProfile) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => save(latest), 500);
    },
    [save],
  );

  // -----------------------------------------------------------------
  // Field updaters
  // -----------------------------------------------------------------
  function setField<K extends keyof PartialProfile>(key: K, value: PartialProfile[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function toggleBusinessFocus(value: string) {
    setProfile((prev) => {
      const current = prev.businessFocus ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      const updated = { ...prev, businessFocus: next };
      saveDebounced(updated);
      return updated;
    });
  }

  function setWorkingStyle(value: string) {
    setProfile((prev) => {
      const updated = { ...prev, workingStyle: value };
      saveDebounced(updated);
      return updated;
    });
  }

  function setCommunicationTone(value: string) {
    setProfile((prev) => {
      const updated = { ...prev, communicationTone: value };
      saveDebounced(updated);
      return updated;
    });
  }

  // -----------------------------------------------------------------
  // Loading skeleton
  // -----------------------------------------------------------------
  if (loading) {
    return <div className="h-40 bg-foreground/[0.04] rounded-md animate-pulse" />;
  }

  // -----------------------------------------------------------------
  // Chip sub-components (defined inline to avoid prop-drilling)
  // -----------------------------------------------------------------
  const ChipMulti = ({
    option,
    selected,
    onToggle,
  }: {
    option: { value: string; label: string };
    selected: boolean;
    onToggle: () => void;
  }) => (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'inline-flex items-center rounded-md border px-3 py-1.5 text-sm transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        selected
          ? 'border-foreground bg-foreground text-background'
          : 'border-border/70 bg-transparent text-muted-foreground hover:border-border hover:text-foreground',
      )}
    >
      {option.label}
    </button>
  );

  const ChipSingle = ({
    option,
    selected,
    onSelect,
  }: {
    option: { value: string; label: string };
    selected: boolean;
    onSelect: () => void;
  }) => (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'inline-flex items-center rounded-md border px-3 py-1.5 text-sm transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        selected
          ? 'border-foreground bg-foreground text-background'
          : 'border-border/70 bg-transparent text-muted-foreground hover:border-border hover:text-foreground',
      )}
    >
      {option.label}
    </button>
  );

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  return (
    <div className="space-y-8">
      {/* ── 1. Preferred name ─────────────────────────────────────── */}
      <div className="space-y-3">
        <p className={SECTION_LABEL}>How should Chippi address you?</p>
        <div className="space-y-1.5">
          <Label htmlFor="displayName" className="text-[12.5px] font-medium text-foreground">
            Preferred name or nickname
          </Label>
          <Input
            id="displayName"
            value={profile.displayName ?? ''}
            onChange={(e) => setField('displayName', e.target.value || null)}
            onBlur={() => saveOnBlur(profile)}
            placeholder="e.g. Alex, Coach, J.T."
            className="max-w-xs"
          />
        </div>
      </div>

      {/* ── 2. Real estate focus ──────────────────────────────────── */}
      <div className="space-y-3">
        <p className={SECTION_LABEL}>Your real estate focus</p>

        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-medium text-foreground">Specialties</Label>
          <p className={CAPTION}>Select all that apply.</p>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {BUSINESS_FOCUS_OPTIONS.map((opt) => (
              <ChipMulti
                key={opt.value}
                option={opt}
                selected={(profile.businessFocus ?? []).includes(opt.value)}
                onToggle={() => toggleBusinessFocus(opt.value)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="yearsExperience" className="text-[12.5px] font-medium text-foreground">
            Years in real estate
          </Label>
          <Input
            id="yearsExperience"
            type="number"
            min={0}
            max={99}
            value={profile.yearsExperience ?? ''}
            onChange={(e) =>
              setField('yearsExperience', e.target.value ? Number(e.target.value) : null)
            }
            onBlur={() => saveOnBlur(profile)}
            placeholder="10"
            className="max-w-[120px]"
          />
        </div>
      </div>

      {/* ── 3. How you work ───────────────────────────────────────── */}
      <div className="space-y-3">
        <p className={SECTION_LABEL}>How you work</p>

        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-medium text-foreground">Working style</Label>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {WORKING_STYLE_OPTIONS.map((opt) => (
              <ChipSingle
                key={opt.value}
                option={opt}
                selected={profile.workingStyle === opt.value}
                onSelect={() => setWorkingStyle(opt.value)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-medium text-foreground">Communication tone</Label>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {COMMUNICATION_TONE_OPTIONS.map((opt) => (
              <ChipSingle
                key={opt.value}
                option={opt}
                selected={profile.communicationTone === opt.value}
                onSelect={() => setCommunicationTone(opt.value)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. Current goals ──────────────────────────────────────── */}
      <div className="space-y-3">
        <p className={SECTION_LABEL}>Your current goals</p>
        <div className="space-y-1.5">
          <Label htmlFor="currentGoals" className="text-[12.5px] font-medium text-foreground">
            Goals
          </Label>
          <Textarea
            id="currentGoals"
            rows={3}
            value={profile.currentGoals ?? ''}
            onChange={(e) => setField('currentGoals', e.target.value || null)}
            onBlur={() => saveOnBlur(profile)}
            placeholder="e.g. Close 20 deals this year, build my referral network, expand into commercial"
          />
        </div>
      </div>

      {/* ── 5. Preferences & quirks ───────────────────────────────── */}
      <div className="space-y-3">
        <p className={SECTION_LABEL}>Preferences &amp; quirks</p>
        <div className="space-y-1.5">
          <Label
            htmlFor="quirksAndPreferences"
            className="text-[12.5px] font-medium text-foreground"
          >
            How you like to work with Chippi
          </Label>
          <Textarea
            id="quirksAndPreferences"
            rows={3}
            value={profile.quirksAndPreferences ?? ''}
            onChange={(e) => setField('quirksAndPreferences', e.target.value || null)}
            onBlur={() => saveOnBlur(profile)}
            placeholder="e.g. I prefer concise responses, always address leads by first name, I work Eastern time"
          />
        </div>
      </div>

      {/* ── 6. Special instructions ───────────────────────────────── */}
      <div className="space-y-3">
        <p className={SECTION_LABEL}>Special instructions for Chippi</p>
        <div className="space-y-1.5">
          <Label
            htmlFor="agentPersonalizationNote"
            className="text-[12.5px] font-medium text-foreground"
          >
            Instructions
          </Label>
          <Textarea
            id="agentPersonalizationNote"
            rows={4}
            value={profile.agentPersonalizationNote ?? ''}
            onChange={(e) => setField('agentPersonalizationNote', e.target.value || null)}
            onBlur={() => saveOnBlur(profile)}
            placeholder="Any specific way you want Chippi to behave — tone, format, topics to avoid..."
          />
          <p className={cn(BODY_MUTED, 'text-xs')}>
            This is fed directly into Chippi&apos;s context.
          </p>
        </div>
      </div>
    </div>
  );
}
