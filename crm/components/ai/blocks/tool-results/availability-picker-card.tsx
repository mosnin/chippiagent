'use client';

/**
 * AvailabilityPickerCard — renders the slots returned by the
 * `propose_tour_times` tool as a tappable day-by-day grid. Click a slot
 * → the workspace fires a "Schedule the tour at <slot>" prompt, which
 * Chippi handles via the normal schedule_tour approval flow. No new
 * endpoint, no permission bypass.
 *
 * Slots arrive pre-formatted with `label` ("Tue, May 20 · 10:00 AM") so
 * this card doesn't re-format dates.
 */

import { useMemo } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

export interface AvailabilityPickerSlot {
  startsAt: string;
  endsAt: string;
  label: string;
}

export interface AvailabilityPickerCardProps {
  slots: AvailabilityPickerSlot[];
  contactId?: string;
  propertyAddress?: string;
  durationMinutes: number;
  /** Called with a pre-formatted prompt the workspace forwards to Chippi
   *  as the realtor's next message. When omitted the card renders as
   *  read-only — slots become inert pills. */
  onSelectSlot?: (prompt: string) => void;
}

function groupByDay(slots: AvailabilityPickerSlot[]): Array<{ day: string; slots: AvailabilityPickerSlot[] }> {
  const map = new Map<string, AvailabilityPickerSlot[]>();
  for (const s of slots) {
    const dayKey = new Date(s.startsAt).toDateString();
    const arr = map.get(dayKey) ?? [];
    arr.push(s);
    map.set(dayKey, arr);
  }
  return Array.from(map.entries()).map(([dayKey, dayslots]) => {
    const d = new Date(dayslots[0].startsAt);
    const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    return { day, slots: dayslots };
  });
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function AvailabilityPickerCard({
  slots,
  contactId,
  propertyAddress,
  durationMinutes,
  onSelectSlot,
}: AvailabilityPickerCardProps) {
  const days = useMemo(() => groupByDay(slots), [slots]);

  if (slots.length === 0) {
    return (
      <div className="mt-2 rounded-lg border border-border/60 bg-card px-4 py-3 text-[12.5px] text-muted-foreground">
        No open slots in the next week during business hours.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="mt-2 rounded-xl border border-border/60 bg-card overflow-hidden"
    >
      {/* Header — context line */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <CalendarDays size={13} className="text-muted-foreground flex-shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-foreground truncate">
            {propertyAddress ? `Tour · ${propertyAddress}` : 'Pick a tour time'}
          </p>
          <p className="text-[11px] text-muted-foreground">{durationMinutes}-minute slots · tap to schedule</p>
        </div>
      </div>

      {/* Days */}
      <div className="px-4 py-3 space-y-3">
        {days.map((day) => (
          <div key={day.day}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 mb-1.5">
              {day.day}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {day.slots.map((s) => (
                <SlotButton
                  key={s.startsAt}
                  slot={s}
                  contactId={contactId}
                  propertyAddress={propertyAddress}
                  onSelectSlot={onSelectSlot}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function SlotButton({
  slot,
  contactId,
  propertyAddress,
  onSelectSlot,
}: {
  slot: AvailabilityPickerSlot;
  contactId?: string;
  propertyAddress?: string;
  onSelectSlot?: (prompt: string) => void;
}) {
  const interactive = Boolean(onSelectSlot);
  const handleClick = () => {
    if (!onSelectSlot) return;
    // Pre-format the prompt Chippi will receive. Include enough context
    // (contact, property) that the model doesn't need to re-ask. The
    // ISO timestamp is the load-bearing detail — schedule_tour parses it.
    const parts = ['Schedule the tour at', slot.label];
    if (propertyAddress) parts.push(`for ${propertyAddress}`);
    if (contactId) parts.push(`(contact ${contactId})`);
    parts.push(`— startsAt ${slot.startsAt}`);
    onSelectSlot(parts.join(' '));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!interactive}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-[12px] font-medium',
        'transition-all duration-150',
        interactive
          ? 'border-border/70 bg-background hover:bg-muted/50 hover:border-border text-foreground/85 active:scale-[0.97] cursor-pointer'
          : 'border-border/40 bg-muted/30 text-muted-foreground cursor-default',
      )}
    >
      <Clock size={10} className="opacity-70 flex-shrink-0" aria-hidden />
      {timeOnly(slot.startsAt)}
    </button>
  );
}
