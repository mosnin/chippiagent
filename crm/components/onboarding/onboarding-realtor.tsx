'use client';

/**
 * Realtor onboarding — six stages, ~4 minutes.
 *
 * Replaces the one-screen `OnboardingQuick`. The point isn't to "collect more
 * fields" — it's that by the end, Chippi already knows the realtor's role,
 * market, audience, voice, and lead sources. The dashboard arrives populated.
 *
 * Stages:
 *   1. Welcome             — one button. Sets tone, not data.
 *   2. Who you are         — role + business name + ZIP + tenure. Creates the workspace.
 *   3. Who you serve       — client types + voice guidance.
 *   4. Voice               — pick warmer vs. direct from two pre-rendered drafts.
 *   5. Lead sources        — channels they use today (multi-select).
 *   6. Plan                — Chippi's first-week plan, derived from the above.
 *
 * Persistence:
 *   - End of stage 2: `save_profile` + `create_space`. Slug is committed.
 *   - End of stages 3, 4, 5: `save_realtor_profile` upsert (cumulative).
 *   - End of stage 6: `complete` → redirect to /s/{slug}/chippi.
 *
 * Refresh recovery is intentionally minimal in Phase 1 — if the realtor
 * bails mid-flow they re-enter stage 1 (their workspace persists). Resume
 * to mid-flow comes later, once we know the drop-off shape.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeSlug, isValidSlug } from '@/lib/intake';
import { rootDomain, cn } from '@/lib/utils';
import { OnboardingShell } from './onboarding-shell';

interface Props {
  defaultName: string;
}

type Stage = 'welcome' | 'who-you-are' | 'who-you-serve' | 'voice' | 'sources' | 'plan';
const STAGE_ORDER: Stage[] = ['welcome', 'who-you-are', 'who-you-serve', 'voice', 'sources', 'plan'];

type Role = 'solo' | 'team_lead' | 'brokerage_owner';
type Tenure = 'lt1' | '1-3' | '4-10' | '10plus';
type Tone = 'warm' | 'direct';

type SlugState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'invalid'; message: string };

// Map tenure bucket → integer yearsExperience for the existing AIUserProfile column.
const TENURE_TO_YEARS: Record<Tenure, number> = { lt1: 0, '1-3': 2, '4-10': 6, '10plus': 12 };

const CLIENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'first_time_buyers', label: 'First-time buyers' },
  { value: 'move_up_families', label: 'Move-up families' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'investors', label: 'Investors' },
  { value: 'sellers', label: 'Sellers / listings' },
  { value: 'renters', label: 'Renters' },
];

const LEAD_SOURCE_OPTIONS: { value: string; label: string; icon?: string }[] = [
  { value: 'sphere', label: 'Sphere & referrals' },
  { value: 'zillow', label: 'Zillow' },
  { value: 'facebook', label: 'Facebook', icon: '/integrations/facebook.svg' },
  { value: 'instagram', label: 'Instagram', icon: '/integrations/instagram.svg' },
  { value: 'linkedin', label: 'LinkedIn', icon: '/integrations/linkedin.svg' },
  { value: 'idx_website', label: 'IDX website' },
  { value: 'open_houses', label: 'Open houses' },
  { value: 'follow_up_boss', label: 'Follow-up Boss', icon: '/integrations/follow-up-boss.svg' },
  { value: 'mailchimp', label: 'Mailchimp', icon: '/integrations/mailchimp.svg' },
  { value: 'google_ads', label: 'Google Ads', icon: '/integrations/googleads.svg' },
];

export function OnboardingRealtor({ defaultName }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('welcome');

  // Stage 2 — workspace creation.
  const [name, setName] = useState(defaultName || '');
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>({ kind: 'idle' });
  const [role, setRole] = useState<Role | null>(null);
  const [zipCode, setZipCode] = useState('');
  const [tenure, setTenure] = useState<Tenure | null>(null);

  // Stage 3 — audience + voice guidance.
  const [clientTypes, setClientTypes] = useState<string[]>([]);
  const [voiceGuidance, setVoiceGuidance] = useState('');

  // Stage 4 — picked tone.
  const [tone, setTone] = useState<Tone | null>(null);

  // Stage 5 — lead sources.
  const [leadSources, setLeadSources] = useState<string[]>([]);

  // Submission state.
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceCreated, setWorkspaceCreated] = useState(false);

  // Auto-derive slug from business name until the realtor edits it.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(normalizeSlug(businessName));
  }, [businessName, slugTouched]);

  // Debounced slug availability check.
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeq = useRef(0);
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!slug) {
      setSlugState({ kind: 'idle' });
      return;
    }
    if (!isValidSlug(slug)) {
      setSlugState({ kind: 'invalid', message: 'Use 3+ lowercase letters, numbers, or dashes.' });
      return;
    }
    setSlugState({ kind: 'checking' });
    const seq = ++checkSeq.current;
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_slug', slug }),
        });
        if (seq !== checkSeq.current) return;
        if (!res.ok) {
          setSlugState({ kind: 'invalid', message: "Couldn't check that one. Try again." });
          return;
        }
        const data = await res.json();
        if (data.reason === 'invalid') {
          setSlugState({ kind: 'invalid', message: 'Use 3+ lowercase letters, numbers, or dashes.' });
        } else if (data.available) {
          setSlugState({ kind: 'available' });
        } else {
          setSlugState({ kind: 'taken' });
        }
      } catch {
        if (seq !== checkSeq.current) return;
        setSlugState({ kind: 'invalid', message: "I lost the connection. Try again." });
      }
    }, 350);
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [slug]);

  const stepIndex = STAGE_ORDER.indexOf(stage);

  const goNext = useCallback(() => {
    const i = STAGE_ORDER.indexOf(stage);
    if (i < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[i + 1]);
  }, [stage]);

  const goBack = useCallback(() => {
    const i = STAGE_ORDER.indexOf(stage);
    if (i > 0) setStage(STAGE_ORDER[i - 1]);
  }, [stage]);

  // ── Persistence ───────────────────────────────────────────────────────────

  const saveProfilePartial = useCallback(async () => {
    if (!workspaceCreated) return;
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_realtor_profile',
          role: role ?? undefined,
          zipCode: zipCode || undefined,
          yearsExperience: tenure ? TENURE_TO_YEARS[tenure] : undefined,
          businessFocus: clientTypes,
          communicationTone: tone ?? undefined,
          quirksAndPreferences: voiceGuidance || undefined,
          leadSources,
        }),
      });
    } catch (err) {
      // Non-fatal — partial saves are best-effort. Final save on stage 6 is required.
      console.error('[onboarding] partial save failed', err);
    }
  }, [workspaceCreated, role, zipCode, tenure, clientTypes, tone, voiceGuidance, leadSources]);

  // Stage 2 → create workspace, then advance.
  const handleStage2Submit = useCallback(async () => {
    if (!role || !tenure || !zipCode || !businessName.trim() || slugState.kind !== 'available') return;
    setSubmitting(true);
    setError(null);
    try {
      const profileRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          name: name.trim(),
          businessName: businessName.trim(),
        }),
      });
      if (!profileRes.ok) throw new Error('profile');

      const spaceRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_space',
          slug,
          businessName: businessName.trim(),
          intakePageTitle: 'Rental Application',
          intakePageIntro: 'Share a few details so I can review your rental fit faster.',
        }),
      });
      if (!spaceRes.ok) {
        if (spaceRes.status === 409) {
          setSlugState({ kind: 'taken' });
          setError('That URL was just taken — pick another.');
          setSubmitting(false);
          return;
        }
        throw new Error('space');
      }

      setWorkspaceCreated(true);

      // Best-effort first profile save with what we have so far.
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_realtor_profile',
          role,
          zipCode,
          yearsExperience: TENURE_TO_YEARS[tenure],
        }),
      });

      setSubmitting(false);
      goNext();
    } catch {
      setError("Couldn't save that. Please try again.");
      setSubmitting(false);
    }
  }, [role, tenure, zipCode, businessName, slug, slugState, name, goNext]);

  // Stage 6 → final save + complete.
  const handleFinish = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await saveProfilePartial();
      const completeRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', accountType: 'realtor' }),
      });
      if (!completeRes.ok) throw new Error('complete');

      toast.success("You're in. Chippi is ready.");
      router.push(`/s/${slug}/chippi`);
    } catch {
      setError("Couldn't finish setup. Please try again.");
      setSubmitting(false);
    }
  }, [saveProfilePartial, slug, router]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <OnboardingShell
      stepIndex={stepIndex}
      totalSteps={STAGE_ORDER.length}
      stepKey={stage}
      onBack={stage !== 'welcome' && stage !== 'who-you-are' ? goBack : undefined}
    >
      {stage === 'welcome' && (
        <StageWelcome onContinue={goNext} />
      )}

      {stage === 'who-you-are' && (
        <StageWhoYouAre
          name={name}
          businessName={businessName}
          slug={slug}
          slugTouched={slugTouched}
          slugState={slugState}
          role={role}
          zipCode={zipCode}
          tenure={tenure}
          submitting={submitting}
          error={error}
          onChangeName={setName}
          onChangeBusinessName={setBusinessName}
          onTouchSlug={(s) => { setSlugTouched(true); setSlug(normalizeSlug(s)); }}
          onChangeRole={setRole}
          onChangeZip={setZipCode}
          onChangeTenure={setTenure}
          onContinue={handleStage2Submit}
        />
      )}

      {stage === 'who-you-serve' && (
        <StageWhoYouServe
          clientTypes={clientTypes}
          voiceGuidance={voiceGuidance}
          onToggleClientType={(v) => setClientTypes((prev) => toggleCapped(prev, v, 3))}
          onChangeVoiceGuidance={setVoiceGuidance}
          onContinue={() => { void saveProfilePartial(); goNext(); }}
        />
      )}

      {stage === 'voice' && (
        <StageVoice
          name={name}
          businessName={businessName}
          tone={tone}
          onPick={(t) => { setTone(t); void saveProfilePartial(); goNext(); }}
        />
      )}

      {stage === 'sources' && (
        <StageSources
          leadSources={leadSources}
          onToggle={(v) => setLeadSources((prev) => toggle(prev, v))}
          onContinue={() => { void saveProfilePartial(); goNext(); }}
        />
      )}

      {stage === 'plan' && (
        <StagePlan
          name={name}
          businessName={businessName}
          clientTypes={clientTypes}
          leadSources={leadSources}
          tone={tone}
          submitting={submitting}
          error={error}
          onFinish={handleFinish}
        />
      )}
    </OnboardingShell>
  );
}

// ── Stage components ──────────────────────────────────────────────────────────

function StageWelcome({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-10 text-center">
      <div className="space-y-3">
        <h1
          className="text-4xl sm:text-5xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Hi. I&apos;m Chippi.
        </h1>
        <p
          className="text-2xl sm:text-3xl tracking-tight text-muted-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Let&apos;s set up your business in about five minutes —
          <br className="hidden sm:block" />
          and by the end, I&apos;ll already be working on it.
        </p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
      >
        Let&apos;s go
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

function StageWhoYouAre(props: {
  name: string;
  businessName: string;
  slug: string;
  slugTouched: boolean;
  slugState: SlugState;
  role: Role | null;
  zipCode: string;
  tenure: Tenure | null;
  submitting: boolean;
  error: string | null;
  onChangeName: (v: string) => void;
  onChangeBusinessName: (v: string) => void;
  onTouchSlug: (v: string) => void;
  onChangeRole: (v: Role) => void;
  onChangeZip: (v: string) => void;
  onChangeTenure: (v: Tenure) => void;
  onContinue: () => void;
}) {
  const linkPreview = props.slug ? `${rootDomain}/apply/${props.slug}` : `${rootDomain}/apply/your-business`;

  const canSubmit =
    !props.submitting &&
    props.role !== null &&
    props.tenure !== null &&
    /^\d{5}$/.test(props.zipCode.trim()) &&
    props.name.trim().length > 0 &&
    props.businessName.trim().length > 0 &&
    props.slugState.kind === 'available';

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          First, tell me who you are.
        </h2>
        <p className="text-sm text-muted-foreground">A few quick taps. No typing where I can avoid it.</p>
      </div>

      {/* Role */}
      <Section label="What are you running?">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <PickerButton selected={props.role === 'solo'} onClick={() => props.onChangeRole('solo')}>
            <span className="font-medium">I&apos;m a solo agent</span>
          </PickerButton>
          <PickerButton selected={props.role === 'team_lead'} onClick={() => props.onChangeRole('team_lead')}>
            <span className="font-medium">I lead a team</span>
          </PickerButton>
          <PickerButton selected={props.role === 'brokerage_owner'} onClick={() => props.onChangeRole('brokerage_owner')}>
            <span className="font-medium">I own the brokerage</span>
          </PickerButton>
        </div>
      </Section>

      {/* Name + business */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Section label="Your name">
          <input
            type="text"
            autoComplete="name"
            value={props.name}
            onChange={(e) => props.onChangeName(e.target.value)}
            placeholder="Sarah Chen"
            className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Section>

        <Section label="What should leads call your business?">
          <input
            type="text"
            autoComplete="organization"
            value={props.businessName}
            onChange={(e) => props.onChangeBusinessName(e.target.value)}
            placeholder="Coastal Realty"
            className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Section>
      </div>

      {/* Slug preview */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground -mt-3">
        <span className="font-mono truncate">{linkPreview}</span>
        {props.slugState.kind === 'checking' && <Loader2 size={11} className="animate-spin flex-shrink-0" />}
        {props.slugState.kind === 'available' && (
          <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        )}
        {props.slugState.kind === 'taken' && (
          <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">taken — pick another name</span>
        )}
        {props.slugState.kind === 'invalid' && (
          <span className="text-amber-600 dark:text-amber-400 flex-shrink-0 truncate">{props.slugState.message}</span>
        )}
        {!props.slugTouched && props.slugState.kind === 'taken' && (
          <button
            type="button"
            onClick={() => props.onTouchSlug(props.slug)}
            className="ml-1 underline text-muted-foreground hover:text-foreground"
          >
            Edit URL
          </button>
        )}
      </div>

      {/* ZIP + tenure */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Section label="Where do you work? (ZIP)">
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={props.zipCode}
            onChange={(e) => props.onChangeZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="33139"
            className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Section>

        <Section label="How long have you been doing this?">
          <div className="grid grid-cols-4 gap-1.5">
            <TenureButton selected={props.tenure === 'lt1'} onClick={() => props.onChangeTenure('lt1')}>&lt; 1 yr</TenureButton>
            <TenureButton selected={props.tenure === '1-3'} onClick={() => props.onChangeTenure('1-3')}>1–3</TenureButton>
            <TenureButton selected={props.tenure === '4-10'} onClick={() => props.onChangeTenure('4-10')}>4–10</TenureButton>
            <TenureButton selected={props.tenure === '10plus'} onClick={() => props.onChangeTenure('10plus')}>10+</TenureButton>
          </div>
        </Section>
      </div>

      {props.error && <ErrorLine message={props.error} />}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={props.onContinue}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {props.submitting ? <Loader2 size={14} className="animate-spin" /> : <>Continue <ArrowRight size={14} /></>}
        </button>
      </div>
    </div>
  );
}

function StageWhoYouServe(props: {
  clientTypes: string[];
  voiceGuidance: string;
  onToggleClientType: (v: string) => void;
  onChangeVoiceGuidance: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          Who do you work with most?
        </h2>
        <p className="text-sm text-muted-foreground">Pick up to 3. I&apos;ll tune my replies and recommendations to them.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CLIENT_TYPE_OPTIONS.map((opt) => {
          const selected = props.clientTypes.includes(opt.value);
          const atCap = !selected && props.clientTypes.length >= 3;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={atCap}
              onClick={() => props.onToggleClientType(opt.value)}
              className={cn(
                'rounded-xl border px-4 py-3 text-sm font-medium transition-all',
                selected
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:bg-muted/30',
                atCap && 'opacity-40 cursor-not-allowed',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <Section label="Anything I should always say — or never say — to a lead? (optional)">
        <textarea
          value={props.voiceGuidance}
          onChange={(e) => props.onChangeVoiceGuidance(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder='e.g. "Never push for a tour on the first message. Always sign off as Sarah from Coastal Realty."'
          className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={props.clientTypes.length === 0}
          onClick={props.onContinue}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function StageVoice({
  name, businessName, tone, onPick,
}: {
  name: string;
  businessName: string;
  tone: Tone | null;
  onPick: (t: Tone) => void;
}) {
  const firstName = (name.trim().split(/\s+/)[0]) || 'me';
  const business = businessName.trim() || 'our team';

  // Two pre-rendered drafts of a first-touch reply to a hypothetical lead.
  // Same scenario for both — only tone differs. Realtor picks the one that
  // sounds like them; Chippi pins that as the default tone going forward.
  const warm = `Hi! Yes, 1422 Pine is still available — great spot, I just walked through it on Saturday. Want me to send a few photos and find a time that works for you to take a look? No pressure either way. — ${firstName} at ${business}`;
  const direct = `Hi — yes, 1422 Pine is available. Asking $625K, 3 bed / 2 bath, last open house had 11 groups through. I can hold a private tour Tue 5–7p or Wed 6–7p. Which works? — ${firstName}, ${business}`;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          Which one sounds more like you?
        </h2>
        <p className="text-sm text-muted-foreground">
          A new lead just asked about a listing. Pick the reply that matches your voice — I&apos;ll match it from here.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VoiceCard label="Warm" body={warm} selected={tone === 'warm'} onClick={() => onPick('warm')} />
        <VoiceCard label="Direct" body={direct} selected={tone === 'direct'} onClick={() => onPick('direct')} />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        You can change this later in Settings → Profile.
      </p>
    </div>
  );
}

function VoiceCard({
  label, body, selected, onClick,
}: {
  label: string;
  body: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left rounded-xl border p-5 transition-all',
        selected ? 'border-foreground bg-foreground/[0.04] shadow-sm' : 'border-border bg-background hover:bg-muted/30',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">{label}</p>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{body}</p>
    </button>
  );
}

function StageSources({
  leadSources,
  onToggle,
  onContinue,
}: {
  leadSources: string[];
  onToggle: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          How do leads find you today?
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick everything that applies. We&apos;ll wire up the connections in Settings — I just want to know where to look first.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {LEAD_SOURCE_OPTIONS.map((opt) => {
          const selected = leadSources.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={cn(
                'rounded-xl border px-3 py-3 text-sm font-medium transition-all flex flex-col items-center gap-2',
                selected
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:bg-muted/30',
              )}
            >
              {opt.icon ? (
                <img src={opt.icon} alt="" aria-hidden className="w-6 h-6 object-contain" />
              ) : (
                <span className={cn('w-6 h-6 rounded-md inline-flex items-center justify-center text-xs font-semibold', selected ? 'bg-background/20' : 'bg-muted text-muted-foreground')}>
                  {opt.label[0]}
                </span>
              )}
              <span className="leading-tight text-center">{opt.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
        >
          {leadSources.length === 0 ? 'Skip for now' : 'Continue'}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function StagePlan({
  name,
  businessName,
  clientTypes,
  leadSources,
  tone,
  submitting,
  error,
  onFinish,
}: {
  name: string;
  businessName: string;
  clientTypes: string[];
  leadSources: string[];
  tone: Tone | null;
  submitting: boolean;
  error: string | null;
  onFinish: () => void;
}) {
  const firstName = (name.trim().split(/\s+/)[0]) || 'there';
  const audience = clientTypes.length > 0
    ? clientTypes.map((c) => CLIENT_TYPE_OPTIONS.find((o) => o.value === c)?.label.toLowerCase() ?? c).join(', ')
    : 'your audience';
  const sourceCount = leadSources.length;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          Here&apos;s what I&apos;m starting on, {firstName}.
        </h2>
        <p className="text-sm text-muted-foreground">Take me in when this looks right — you can change anything later.</p>
      </div>

      <div className="space-y-3">
        <PlanCard
          eyebrow="Voice"
          title={tone === 'warm' ? 'Warm and inviting' : 'Direct and informative'}
          body={`I&rsquo;ll match this tone in every draft I write on behalf of ${businessName.trim() || 'you'}.`}
        />
        <PlanCard
          eyebrow="Focus"
          title={`Tuned for ${audience}`}
          body="I&rsquo;ll prioritize leads and suggestions that fit this audience, and skip the ones that don&rsquo;t."
        />
        <PlanCard
          eyebrow="Watching"
          title={sourceCount > 0 ? `${sourceCount} lead ${sourceCount === 1 ? 'source' : 'sources'} on my radar` : 'Inbox and intake link'}
          body={sourceCount > 0
            ? 'Connect them in Settings → Integrations and I&rsquo;ll start pulling leads in.'
            : 'Connect more sources in Settings → Integrations whenever you&rsquo;re ready.'}
        />
        <PlanCard
          eyebrow="Today"
          title="Your intake link is live"
          body="Share it on listings, email signatures, and your social bios — every submission flows straight to me for triage."
        />
      </div>

      {error && <ErrorLine message={error} />}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onFinish}
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <>Looks good, take me in <ArrowRight size={14} /></>}
        </button>
      </div>
    </div>
  );
}

function PlanCard({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{eyebrow}</p>
      <p className="text-sm font-medium text-foreground" dangerouslySetInnerHTML={{ __html: title }} />
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function PickerButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-4 py-3 text-sm transition-all',
        selected ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground hover:bg-muted/30',
      )}
    >
      {children}
    </button>
  );
}

function TenureButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2 py-2.5 text-sm font-medium transition-all',
        selected ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground hover:bg-muted/30',
      )}
    >
      {children}
    </button>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/40 px-3 py-2.5 text-sm text-rose-800 dark:text-rose-200">
      <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function toggleCapped<T>(arr: T[], v: T, cap: number): T[] {
  if (arr.includes(v)) return arr.filter((x) => x !== v);
  if (arr.length >= cap) return arr;
  return [...arr, v];
}
