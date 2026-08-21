/**
 * Google Calendar event sync rules for tours.
 *
 * A failed PUT must not create a second event. Duplicate GCal events keep
 * a slot marked busy after the tour moves or cancels — a missed slot.
 */

export function encodeCalendarId(calendarId: string): string {
  return encodeURIComponent(calendarId);
}

/** Google says the event is gone. Any other status keeps the existing id. */
export function gcalEventGone(status: number): boolean {
  return status === 404 || status === 410;
}

/** These statuses free the realtor. The GCal event must come off the calendar. */
export function tourFreesGcalSlot(status: string): boolean {
  return status === 'cancelled' || status === 'no_show';
}
