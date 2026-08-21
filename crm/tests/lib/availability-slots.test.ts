import { describe, expect, it } from 'vitest';
import { buildAvailabilitySlots } from '@/lib/calendar/availability-slots';

process.env.TZ = 'UTC';

function fridayWindow(busy: Array<{ start: number; end: number }>) {
  return buildAvailabilitySlots({
    now: new Date('2026-08-21T00:00:00.000Z'),
    startDate: new Date('2026-08-21T00:00:00.000Z'),
    timezone: 'UTC',
    duration: 30,
    startHour: 9,
    endHour: 12,
    daysAvailable: [5], // Friday 2026-08-21
    blockedDates: [],
    overrideMap: new Map(),
    busy,
  });
}

function timesOn(slots: ReturnType<typeof fridayWindow>, date: string): string[] {
  return slots.find((d) => d.date === date)?.times ?? [];
}

describe('buildAvailabilitySlots conflicts', () => {
  it('hides a slot that overlaps a tour booked on any property', () => {
    const open = timesOn(fridayWindow([]), '2026-08-21');
    const taken = timesOn(
      fridayWindow([
        {
          start: Date.parse('2026-08-21T10:00:00.000Z'),
          end: Date.parse('2026-08-21T10:30:00.000Z'),
        },
      ]),
      '2026-08-21',
    );

    expect(open).toContain('2026-08-21T10:00:00.000Z');
    expect(taken).not.toContain('2026-08-21T10:00:00.000Z');
    expect(taken).toContain('2026-08-21T09:30:00.000Z');
    expect(taken).toContain('2026-08-21T10:30:00.000Z');
  });

  it('hides the next slot when an in-progress tour plus buffer still overlaps it', () => {
    const taken = timesOn(
      fridayWindow([
        {
          start: Date.parse('2026-08-21T08:45:00.000Z'),
          end: Date.parse('2026-08-21T09:45:00.000Z'),
        },
      ]),
      '2026-08-21',
    );
    expect(taken).not.toContain('2026-08-21T09:00:00.000Z');
    expect(taken).not.toContain('2026-08-21T09:30:00.000Z');
    expect(taken).toContain('2026-08-21T10:00:00.000Z');
  });

  it('hides slots that overlap an in-app CalendarEvent', () => {
    const taken = timesOn(
      fridayWindow([
        {
          start: Date.parse('2026-08-21T11:00:00.000Z'),
          end: Date.parse('2026-08-21T12:00:00.000Z'),
        },
      ]),
      '2026-08-21',
    );
    expect(taken).not.toContain('2026-08-21T11:00:00.000Z');
    expect(taken).not.toContain('2026-08-21T11:30:00.000Z');
    expect(taken).toContain('2026-08-21T10:30:00.000Z');
  });
});
