'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Loader2, ChevronLeft, MapPin, Globe, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickContrastColor } from '@/lib/color';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { Label } from '@/components/ui/label';
import { fireConversionEvents } from '@/lib/tracking-events';
import { PRIMARY_PILL, QUIET_LINK, SECTION_LABEL, TITLE_FONT } from '@/lib/typography';

interface BookingFormProps {
  slug: string;
  duration: number;
  businessName: string;
  timezone: string;
  accentColor?: string;
}

interface DaySlots {
  date: string;
  times: string[];
}

interface PropertyProfile {
  id: string;
  name: string;
  address: string | null;
  tourDuration: number;
}

type Step = 'property' | 'date' | 'details' | 'confirmed';

// Uniform paper-flat input class. Identical for input + textarea so the eye
// reads them as one family.
const FIELD_BASE =
  'w-full bg-background border border-border/70 rounded-md px-3 text-base focus:border-foreground/30 focus:outline-none transition-colors placeholder:text-muted-foreground/70';
const INPUT_CLASS = cn(FIELD_BASE, 'h-10');
const TEXTAREA_CLASS = cn(FIELD_BASE, 'py-2 min-h-[72px]');
const FIELD_LABEL = 'text-[12.5px] font-medium text-foreground';

export function BookingForm({ slug, duration: defaultDuration, businessName, timezone, accentColor = '#ff964f' }: BookingFormProps) {
  const primaryTextColor = pickContrastColor(accentColor);
  const confettiRef = useRef<ConfettiRef>(null);
  const [step, setStep] = useState<Step>('date');
  const [slots, setSlots] = useState<DaySlots[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Property selection
  const [properties, setProperties] = useState<PropertyProfile[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [effectiveDuration, setEffectiveDuration] = useState(defaultDuration);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Waitlist state
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistDate, setWaitlistDate] = useState('');
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  // Detect guest timezone
  const guestTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
  const showTzNote = guestTz && guestTz !== timezone;

  async function loadSlots(propId?: string | null, currentStep?: Step) {
    setLoading(true);
    setSelectedDate(null);
    setSelectedTime(null);
    try {
      let url = `/api/tours/available?slug=${encodeURIComponent(slug)}`;
      if (propId) url += `&propertyId=${encodeURIComponent(propId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots ?? []);
        setEffectiveDuration(data.duration ?? defaultDuration);
        // If properties exist and we haven't shown the property picker yet
        // Use the passed-in step to avoid stale closure on the state variable
        const stepAtLoad = currentStep ?? step;
        if (data.propertyProfiles?.length > 0 && !propId && stepAtLoad === 'date') {
          setProperties(data.propertyProfiles);
          setStep('property');
        }
      } else {
        setError('Could not load availability');
      }
    } catch {
      setError('Could not load availability');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSlots(null, 'date'); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectProperty(id: string | null) {
    setSelectedPropertyId(id);
    if (id) {
      const prop = properties.find((p) => p.id === id);
      if (prop?.address) setPropertyAddress(prop.address);
    }
    setStep('date');
    loadSlots(id, 'date');
  }

  const selectedDaySlots = slots.find((s) => s.date === selectedDate);

  async function handleSubmit() {
    if (!selectedTime || !guestName.trim() || !guestEmail.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/tours/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim() || null,
          propertyAddress: propertyAddress.trim() || null,
          notes: notes.trim() || null,
          startsAt: selectedTime,
          propertyProfileId: selectedPropertyId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Booking failed');
      }
      setStep('confirmed');
      // Fire tracking pixel conversion events on successful booking
      fireConversionEvents();
      setTimeout(() => {
        confettiRef.current?.fire({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        confettiRef.current?.fire({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } });
        confettiRef.current?.fire({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } });
      }, 300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTzShort(tz: string) {
    try {
      return new Date().toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() || tz;
    } catch { return tz; }
  }

  async function handleWaitlistSubmit() {
    if (!waitlistName.trim() || !waitlistEmail.trim() || !waitlistDate) return;
    setWaitlistSubmitting(true);
    try {
      const res = await fetch('/api/tours/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          guestName: waitlistName.trim(),
          guestEmail: waitlistEmail.trim(),
          preferredDate: waitlistDate,
          propertyProfileId: selectedPropertyId,
        }),
      });
      if (res.ok || res.status === 409) {
        setWaitlistDone(true);
      }
    } catch {
      // silent
    } finally {
      setWaitlistSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === 'confirmed') {
    const dateLabel = selectedTime
      ? new Date(selectedTime).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
      : '';
    const timeLabel = selectedTime ? formatTime(selectedTime) : '';
    return (
      <>
        <Confetti ref={confettiRef} manualstart className="pointer-events-none fixed inset-0 z-[9999] w-full h-full" />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="text-center space-y-4 py-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 15 }}
            className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto"
          >
            <Check size={20} className="text-emerald-600 dark:text-emerald-400" />
          </motion.div>
          <h2 className="text-3xl tracking-tight text-foreground" style={TITLE_FONT}>
            Confirmed.
          </h2>
          <p className="text-base text-muted-foreground max-w-sm mx-auto">
            Your tour is set for <span className="font-medium text-foreground">{dateLabel}</span>{' '}
            at <span className="font-medium text-foreground">{timeLabel}</span>.
            {` ${businessName} will reach out if anything changes.`}
          </p>
        </motion.div>
      </>
    );
  }

  // Visual sections render progressively. The state machine is preserved:
  // - 'property' lock: only the property section is interactive
  // - 'date' lock: property is summarized + collapsed; date+time is open
  // - 'details' lock: above are summarized; details form is open
  const showProperty = properties.length > 0;
  const propertyChosen = step === 'date' || step === 'details';
  const showDateSection = step === 'date' || step === 'details';
  const showDetailsSection = step === 'details';

  const selectedProperty = selectedPropertyId
    ? properties.find((p) => p.id === selectedPropertyId)
    : null;

  return (
    <>
      <div className="rounded-xl bg-background border border-border/70 p-6">
        {/* ─── Property section ─────────────────────────────────────────── */}
        {showProperty && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <p className={SECTION_LABEL}>Property</p>
              {propertyChosen && (
                <button
                  type="button"
                  onClick={() => { setStep('property'); setSelectedPropertyId(null); }}
                  className={cn(QUIET_LINK, 'text-xs')}
                >
                  Change
                </button>
              )}
            </div>

            {step === 'property' ? (
              <div className="space-y-2">
                {properties.map((p) => {
                  const active = selectedPropertyId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProperty(p.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors',
                        active
                          ? 'border-foreground/40 bg-foreground/[0.045] ring-2 ring-foreground/10'
                          : 'border-border/70 hover:bg-foreground/[0.04]',
                      )}
                    >
                      <MapPin size={16} className="text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        {p.address && <p className="text-xs text-muted-foreground truncate">{p.address}</p>}
                      </div>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => selectProperty(null)}
                  className="w-full px-4 py-3 rounded-lg border border-dashed border-border/70 text-center text-xs text-muted-foreground hover:bg-foreground/[0.04] transition-colors"
                >
                  Not sure yet / general inquiry
                </button>
              </div>
            ) : (
              <p className="text-sm text-foreground">
                {selectedProperty ? (
                  <>
                    <span className="font-medium">{selectedProperty.name}</span>
                    {selectedProperty.address && (
                      <span className="text-muted-foreground"> · {selectedProperty.address}</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">General inquiry</span>
                )}
              </p>
            )}
          </section>
        )}

        {/* Divider only between sections that are both visible */}
        {showProperty && showDateSection && (
          <div className="border-t border-border/60 my-8" />
        )}

        {/* ─── Date + time section ──────────────────────────────────────── */}
        {showDateSection && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <p className={SECTION_LABEL}>Pick a time</p>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">{effectiveDuration} min</span>
                {showTzNote && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Globe size={11} />
                    {formatTzShort(guestTz)}
                  </span>
                )}
                {step === 'details' && (
                  <button
                    type="button"
                    onClick={() => setStep('date')}
                    className={cn(QUIET_LINK, 'text-xs')}
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            {step === 'details' ? (
              <p className="text-sm text-foreground">
                <span className="font-medium">{selectedDate && formatDate(selectedDate)}</span>
                <span className="text-muted-foreground"> at </span>
                <span className="font-medium">{selectedTime && formatTime(selectedTime)}</span>
              </p>
            ) : slots.length === 0 ? (
              <div className="text-center py-6 space-y-4">
                <p className="text-sm text-muted-foreground">No available time slots right now.</p>
                {!showWaitlist && !waitlistDone && (
                  <button
                    type="button"
                    onClick={() => setShowWaitlist(true)}
                    className="inline-flex items-center gap-2 px-4 h-9 rounded-md border border-border/70 text-sm text-foreground hover:bg-foreground/[0.04] transition-colors"
                  >
                    <Bell size={14} />
                    Join waitlist
                  </button>
                )}
                {showWaitlist && !waitlistDone && (
                  <div className="text-left space-y-3 max-w-sm mx-auto">
                    <p className="text-xs text-muted-foreground">Get notified when a slot opens.</p>
                    <div className="space-y-1.5">
                      <Label htmlFor="waitlistDate" className={FIELD_LABEL}>Preferred date</Label>
                      <input
                        id="waitlistDate"
                        type="date"
                        value={waitlistDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setWaitlistDate(e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="waitlistName" className={FIELD_LABEL}>Your name</Label>
                      <input
                        id="waitlistName"
                        type="text"
                        value={waitlistName}
                        onChange={(e) => setWaitlistName(e.target.value)}
                        placeholder="Jane Smith"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="waitlistEmail" className={FIELD_LABEL}>Your email</Label>
                      <input
                        id="waitlistEmail"
                        type="email"
                        value={waitlistEmail}
                        onChange={(e) => setWaitlistEmail(e.target.value)}
                        placeholder="jane@example.com"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleWaitlistSubmit}
                      disabled={waitlistSubmitting || !waitlistName.trim() || !waitlistEmail.trim() || !waitlistDate}
                      className={cn(PRIMARY_PILL, 'w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed')}
                      style={{ backgroundColor: accentColor, color: primaryTextColor }}
                    >
                      {waitlistSubmitting && <Loader2 size={14} className="animate-spin" />}
                      {waitlistSubmitting ? 'Joining…' : 'Join waitlist'}
                    </button>
                  </div>
                )}
                {waitlistDone && (
                  <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <Check size={16} />
                    You&apos;re on the waitlist. We&apos;ll let you know.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Date strip — paper-flat. Today/active uses foreground tone. */}
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {slots.map((s) => {
                    const active = selectedDate === s.date;
                    return (
                      <button
                        key={s.date}
                        type="button"
                        onClick={() => { setSelectedDate(s.date); setSelectedTime(null); }}
                        className={cn(
                          'flex-shrink-0 px-3 py-2 rounded-md text-center transition-colors min-w-[72px]',
                          active
                            ? 'bg-foreground text-background'
                            : 'bg-foreground/[0.04] hover:bg-foreground/[0.06] text-foreground',
                        )}
                      >
                        <div className="text-[10px] uppercase tracking-wider opacity-70">
                          {new Date(s.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short' })}
                        </div>
                        <div className="text-sm font-medium">
                          {new Date(s.date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedDate && selectedDaySlots && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[320px] overflow-y-auto">
                    {selectedDaySlots.times.map((t) => {
                      const active = selectedTime === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSelectedTime(t)}
                          className={cn(
                            'h-9 px-3 rounded-md text-sm transition-colors',
                            active
                              ? 'font-medium'
                              : 'bg-foreground/[0.04] hover:bg-foreground/[0.06] text-foreground',
                          )}
                          style={active ? { backgroundColor: accentColor, color: primaryTextColor } : undefined}
                        >
                          {formatTime(t)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedTime && (
                  <button
                    type="button"
                    onClick={() => setStep('details')}
                    className={cn(PRIMARY_PILL, 'w-full justify-center')}
                    style={{ backgroundColor: accentColor, color: primaryTextColor }}
                  >
                    Continue
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* ─── Details section ──────────────────────────────────────────── */}
        {showDetailsSection && (
          <>
            <div className="border-t border-border/60 my-8" />
            <section>
              <div className="flex items-center justify-between mb-4">
                <p className={SECTION_LABEL}>Your details</p>
                <button
                  type="button"
                  onClick={() => setStep('date')}
                  className={cn(QUIET_LINK, 'text-xs inline-flex items-center gap-1')}
                >
                  <ChevronLeft size={12} />
                  Back
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="guestName" className={FIELD_LABEL}>
                      Full name
                    </Label>
                    <input
                      id="guestName"
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Jane Smith"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="guestEmail" className={FIELD_LABEL}>
                      Email
                    </Label>
                    <input
                      id="guestEmail"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="jane@example.com"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="guestPhone" className={FIELD_LABEL}>
                      Phone <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <input
                      id="guestPhone"
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="propertyAddress" className={FIELD_LABEL}>
                      Property address <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <input
                      id="propertyAddress"
                      type="text"
                      value={propertyAddress}
                      onChange={(e) => setPropertyAddress(e.target.value)}
                      placeholder="123 Main St"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className={FIELD_LABEL}>
                    Notes <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Anything we should know?"
                    className={TEXTAREA_CLASS}
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-3">{error}</p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !guestName.trim() || !guestEmail.trim()}
                className={cn(PRIMARY_PILL, 'w-full justify-center mt-6 disabled:opacity-60 disabled:cursor-not-allowed')}
                style={{ backgroundColor: accentColor, color: primaryTextColor }}
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Booking…' : 'Confirm booking'}
              </button>
            </section>
          </>
        )}

        {/* Surface availability errors at the bottom of the picker step */}
        {error && step !== 'details' && (
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-4 text-center">{error}</p>
        )}
      </div>

      {/* Processing overlay — kept minimal, paper-flat */}
      <AnimatePresence>
        {submitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-xl bg-background border border-border/70 p-6 text-center space-y-3"
            >
              <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-foreground">Booking your tour…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
