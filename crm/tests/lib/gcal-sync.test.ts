import { describe, expect, it } from 'vitest';
import { encodeCalendarId, gcalEventGone, tourFreesGcalSlot } from '@/lib/calendar/gcal-sync';

describe('encodeCalendarId', () => {
  it('leaves primary untouched', () => {
    expect(encodeCalendarId('primary')).toBe('primary');
  });

  it('encodes email calendar ids so the events path does not split on @', () => {
    expect(encodeCalendarId('jane@example.com')).toBe('jane%40example.com');
  });
});

describe('gcalEventGone', () => {
  it('recreates only when Google says the event is gone', () => {
    expect(gcalEventGone(404)).toBe(true);
    expect(gcalEventGone(410)).toBe(true);
    expect(gcalEventGone(500)).toBe(false);
    expect(gcalEventGone(403)).toBe(false);
    expect(gcalEventGone(401)).toBe(false);
  });
});

describe('tourFreesGcalSlot', () => {
  it('removes the GCal event for cancelled and no-show tours', () => {
    expect(tourFreesGcalSlot('cancelled')).toBe(true);
    expect(tourFreesGcalSlot('no_show')).toBe(true);
    expect(tourFreesGcalSlot('scheduled')).toBe(false);
    expect(tourFreesGcalSlot('confirmed')).toBe(false);
    expect(tourFreesGcalSlot('completed')).toBe(false);
  });
});
