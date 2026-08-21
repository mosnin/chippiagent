/**
 * Busy-interval helpers for tour availability.
 *
 * The public booking page and `book_tour_atomic` must agree: a realtor is
 * one person. A slot that overlaps any scheduled/confirmed tour, any
 * in-app CalendarEvent, or a Google Calendar busy period is taken.
 */

export type BusyInterval = { start: number; end: number };

export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function withBuffer(
  startMs: number,
  endMs: number,
  bufferMinutes: number,
): BusyInterval {
  const pad = Math.max(0, bufferMinutes) * 60_000;
  return { start: startMs - pad, end: endMs + pad };
}

export function slotHasConflict(
  slotStart: number,
  slotEnd: number,
  busy: BusyInterval[],
): boolean {
  return busy.some((b) => intervalsOverlap(slotStart, slotEnd, b.start, b.end));
}

/** Inclusive overlap window: tours that intersect [start, end], plus trailing buffer. */
export function tourOverlapWindow(
  startDate: Date,
  endDate: Date,
  bufferMinutes: number,
): { from: string; to: string } {
  const pad = Math.max(0, bufferMinutes) * 60_000;
  return {
    from: new Date(startDate.getTime() - pad).toISOString(),
    to: endDate.toISOString(),
  };
}

export function toursToBusy(
  tours: Array<{ startsAt: string; endsAt: string }>,
  bufferMinutes: number,
): BusyInterval[] {
  return tours
    .map((t) => {
      const start = new Date(t.startsAt).getTime();
      const end = new Date(t.endsAt).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return withBuffer(start, end, bufferMinutes);
    })
    .filter((b): b is BusyInterval => b !== null);
}

/**
 * CalendarEvent.date is YYYY-MM-DD. Optional time is HH:MM stored as UTC
 * (see `block_time`). No time → the whole UTC day is busy.
 */
export function calendarEventBand(
  date: string,
  time: string | null,
): { startsAt: string; endsAt: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const startsAt = new Date(`${date}T${time}:00.000Z`).toISOString();
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString();
    return { startsAt, endsAt };
  }
  return {
    startsAt: new Date(`${date}T00:00:00.000Z`).toISOString(),
    endsAt: new Date(`${date}T23:59:59.000Z`).toISOString(),
  };
}

export function calendarEventsToBusy(
  events: Array<{ date: string; time: string | null }>,
  bufferMinutes: number,
): BusyInterval[] {
  const out: BusyInterval[] = [];
  for (const e of events) {
    const band = calendarEventBand(e.date, e.time);
    if (!band) continue;
    const start = new Date(band.startsAt).getTime();
    const end = new Date(band.endsAt).getTime();
    // All-day rows already cover the day — do not pad them into yesterday/tomorrow.
    if (e.time && /^\d{2}:\d{2}$/.test(e.time)) {
      out.push(withBuffer(start, end, bufferMinutes));
    } else {
      out.push({ start, end });
    }
  }
  return out;
}

export type FreeBusyParse =
  | { ok: true; busy: BusyInterval[] }
  | { ok: false };

/**
 * Google freeBusy can return `{ errors: [...] }` with no `busy` array.
 * Treat that as "we do not know" — never as free.
 */
export function parseFreeBusy(data: unknown, calendarId: string): FreeBusyParse {
  if (!data || typeof data !== 'object') return { ok: false };
  const calendars = (data as { calendars?: unknown }).calendars;
  if (!calendars || typeof calendars !== 'object') return { ok: false };
  const cal = (calendars as Record<string, unknown>)[calendarId];
  if (!cal || typeof cal !== 'object') return { ok: false };
  const rec = cal as { busy?: unknown; errors?: unknown };
  if (Array.isArray(rec.errors) && rec.errors.length > 0) return { ok: false };
  if (!Array.isArray(rec.busy)) return { ok: false };

  const busy: BusyInterval[] = [];
  for (const raw of rec.busy) {
    if (!raw || typeof raw !== 'object') continue;
    const startStr = (raw as { start?: unknown }).start;
    const endStr = (raw as { end?: unknown }).end;
    if (typeof startStr !== 'string' || typeof endStr !== 'string') continue;
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    busy.push({ start, end });
  }
  return { ok: true, busy };
}

export function applyBufferToBusy(
  busy: BusyInterval[],
  bufferMinutes: number,
): BusyInterval[] {
  return busy.map((b) => withBuffer(b.start, b.end, bufferMinutes));
}

/**
 * Drop GCal busy periods that are leftover events from cancelled/no-show
 * tours (sync writes the tour's exact startsAt/endsAt). Match within 1s.
 */
export function subtractMatchingIntervals(
  busy: BusyInterval[],
  leftovers: BusyInterval[],
): BusyInterval[] {
  if (leftovers.length === 0) return busy;
  return busy.filter(
    (b) =>
      !leftovers.some(
        (l) => Math.abs(b.start - l.start) < 1000 && Math.abs(b.end - l.end) < 1000,
      ),
  );
}
