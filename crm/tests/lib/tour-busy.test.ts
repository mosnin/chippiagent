import { describe, expect, it } from 'vitest';
import {
  applyBufferToBusy,
  calendarEventBand,
  calendarEventsToBusy,
  intervalsOverlap,
  parseFreeBusy,
  slotHasConflict,
  subtractMatchingIntervals,
  tourOverlapWindow,
  toursToBusy,
} from '@/lib/calendar/tour-busy';

describe('intervalsOverlap / slotHasConflict', () => {
  it('treats touching endpoints as free (no double-book of adjacent slots)', () => {
    expect(intervalsOverlap(0, 30, 30, 60)).toBe(false);
    expect(slotHasConflict(30, 60, [{ start: 0, end: 30 }])).toBe(false);
  });

  it('flags any interior overlap as a conflict', () => {
    expect(intervalsOverlap(0, 30, 15, 45)).toBe(true);
    expect(slotHasConflict(15 * 60_000, 45 * 60_000, [
      { start: 0, end: 30 * 60_000 },
    ])).toBe(true);
  });
});

describe('toursToBusy', () => {
  it('pads both sides by the travel buffer', () => {
    const busy = toursToBusy(
      [{ startsAt: '2026-08-21T18:00:00.000Z', endsAt: '2026-08-21T18:30:00.000Z' }],
      15,
    );
    expect(busy).toEqual([
      {
        start: Date.parse('2026-08-21T17:45:00.000Z'),
        end: Date.parse('2026-08-21T18:45:00.000Z'),
      },
    ]);
  });
});

describe('tourOverlapWindow', () => {
  it('rewinds the start bound by the buffer so a tour ending just before the window still blocks', () => {
    const start = new Date('2026-08-21T14:00:00.000Z');
    const end = new Date('2026-08-22T14:00:00.000Z');
    const w = tourOverlapWindow(start, end, 15);
    expect(w.from).toBe('2026-08-21T13:45:00.000Z');
    expect(w.to).toBe('2026-08-22T14:00:00.000Z');
  });
});

describe('calendarEventBand / calendarEventsToBusy', () => {
  it('treats timed events as 60-minute UTC blocks and applies buffer', () => {
    const band = calendarEventBand('2026-08-21', '14:00');
    expect(band).toEqual({
      startsAt: '2026-08-21T14:00:00.000Z',
      endsAt: '2026-08-21T15:00:00.000Z',
    });
    const busy = calendarEventsToBusy([{ date: '2026-08-21', time: '14:00' }], 15);
    expect(busy[0].start).toBe(Date.parse('2026-08-21T13:45:00.000Z'));
    expect(busy[0].end).toBe(Date.parse('2026-08-21T15:15:00.000Z'));
  });

  it('treats dateless-time events as the full UTC day without buffer bleed', () => {
    const busy = calendarEventsToBusy([{ date: '2026-08-21', time: null }], 15);
    expect(busy).toEqual([
      {
        start: Date.parse('2026-08-21T00:00:00.000Z'),
        end: Date.parse('2026-08-21T23:59:59.000Z'),
      },
    ]);
  });
});

describe('parseFreeBusy', () => {
  it('reads busy periods for the requested calendar', () => {
    const parsed = parseFreeBusy(
      {
        calendars: {
          primary: {
            busy: [
              { start: '2026-08-21T16:00:00Z', end: '2026-08-21T17:00:00Z' },
            ],
          },
        },
      },
      'primary',
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.busy).toEqual([
        {
          start: Date.parse('2026-08-21T16:00:00Z'),
          end: Date.parse('2026-08-21T17:00:00Z'),
        },
      ]);
    }
  });

  it('treats an empty busy array as free, not unknown', () => {
    const parsed = parseFreeBusy({ calendars: { primary: { busy: [] } } }, 'primary');
    expect(parsed).toEqual({ ok: true, busy: [] });
  });

  it('fails closed when Google returns calendar errors and no busy list', () => {
    const parsed = parseFreeBusy(
      {
        calendars: {
          primary: { errors: [{ domain: 'global', reason: 'notFound' }] },
        },
      },
      'primary',
    );
    expect(parsed.ok).toBe(false);
  });

  it('fails closed when the calendar key is missing', () => {
    expect(parseFreeBusy({ calendars: {} }, 'primary').ok).toBe(false);
    expect(parseFreeBusy({}, 'primary').ok).toBe(false);
  });
});

describe('applyBufferToBusy / subtractMatchingIntervals', () => {
  it('pads GCal meetings with the same travel buffer as tours', () => {
    const padded = applyBufferToBusy(
      [{ start: Date.parse('2026-08-21T16:00:00Z'), end: Date.parse('2026-08-21T17:00:00Z') }],
      15,
    );
    expect(padded[0].start).toBe(Date.parse('2026-08-21T15:45:00Z'));
    expect(padded[0].end).toBe(Date.parse('2026-08-21T17:15:00Z'));
  });

  it('drops leftover cancelled-tour events so the slot is offered again', () => {
    const tourStart = Date.parse('2026-08-21T18:00:00.000Z');
    const tourEnd = Date.parse('2026-08-21T18:30:00.000Z');
    const remaining = subtractMatchingIntervals(
      [
        { start: tourStart, end: tourEnd },
        { start: Date.parse('2026-08-21T20:00:00.000Z'), end: Date.parse('2026-08-21T21:00:00.000Z') },
      ],
      [{ start: tourStart, end: tourEnd }],
    );
    expect(remaining).toEqual([
      {
        start: Date.parse('2026-08-21T20:00:00.000Z'),
        end: Date.parse('2026-08-21T21:00:00.000Z'),
      },
    ]);
  });
});
