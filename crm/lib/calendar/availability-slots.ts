/**
 * Generate bookable tour slots for a 14-day window.
 *
 * Hours are in the space timezone. Conflict math is UTC milliseconds
 * against the merged busy list (tours + CalendarEvents + GCal).
 */

import type { BusyInterval } from './tour-busy';
import { slotHasConflict } from './tour-busy';

export type AvailabilityOverride = {
  date: string;
  isBlocked: boolean;
  startHour: number | null;
  endHour: number | null;
  recurrence: string;
  endDate: string | null;
  propertyProfileId: string | null;
};

export type DaySlots = { date: string; times: string[] };

export function expandOverrides(
  overrides: AvailabilityOverride[],
  startDate: Date,
  endDate: Date,
  propertyId: string | null,
): Map<string, { isBlocked: boolean; startHour: number | null; endHour: number | null }> {
  const overrideMap = new Map<
    string,
    { isBlocked: boolean; startHour: number | null; endHour: number | null }
  >();

  for (const o of overrides) {
    if (propertyId && o.propertyProfileId && o.propertyProfileId !== propertyId) continue;
    if (!propertyId && o.propertyProfileId) continue;

    if (o.recurrence === 'none') {
      overrideMap.set(o.date, {
        isBlocked: o.isBlocked,
        startHour: o.startHour,
        endHour: o.endHour,
      });
    } else {
      const oStart = new Date(o.date + 'T12:00:00');
      const oEnd = o.endDate ? new Date(o.endDate + 'T12:00:00') : endDate;
      const cur = new Date(oStart);

      while (cur <= oEnd && cur <= endDate) {
        if (cur >= startDate) {
          const key = cur.toISOString().split('T')[0];
          if (!overrideMap.has(key)) {
            overrideMap.set(key, {
              isBlocked: o.isBlocked,
              startHour: o.startHour,
              endHour: o.endHour,
            });
          }
        }
        if (o.recurrence === 'weekly') {
          cur.setDate(cur.getDate() + 7);
        } else if (o.recurrence === 'biweekly') {
          cur.setDate(cur.getDate() + 14);
        } else if (o.recurrence === 'monthly') {
          cur.setMonth(cur.getMonth() + 1);
        } else {
          break;
        }
      }
    }
  }

  return overrideMap;
}

function getTimezoneOffsetMs(date: Date, tz: string): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = date.toLocaleString('en-US', { timeZone: tz });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  return tzDate.getTime() - utcDate.getTime();
}

export function buildAvailabilitySlots(input: {
  now: Date;
  startDate: Date;
  timezone: string;
  duration: number;
  startHour: number;
  endHour: number;
  daysAvailable: number[];
  blockedDates: string[];
  overrideMap: Map<string, { isBlocked: boolean; startHour: number | null; endHour: number | null }>;
  busy: BusyInterval[];
}): DaySlots[] {
  const {
    now,
    startDate,
    timezone,
    duration,
    startHour,
    endHour,
    daysAvailable,
    blockedDates,
    overrideMap,
    busy,
  } = input;

  const blockedSet = new Set(blockedDates);
  const slots: DaySlots[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(12, 0, 0, 0);

  for (let day = 0; day < 14; day++) {
    const tzOffset = getTimezoneOffsetMs(cursor, timezone);
    const localDate = new Date(cursor.getTime() + tzOffset);
    const dayOfWeek = localDate.getDay();
    const dateKey = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;

    const override = overrideMap.get(dateKey);

    let dayAvailable = false;
    let dayStart = startHour;
    let dayEnd = endHour;

    if (override) {
      if (override.isBlocked) {
        dayAvailable = false;
      } else if (override.startHour != null && override.endHour != null) {
        dayAvailable = true;
        dayStart = override.startHour;
        dayEnd = override.endHour;
      }
    } else {
      dayAvailable = daysAvailable.includes(dayOfWeek) && !blockedSet.has(dateKey);
    }

    if (dayAvailable) {
      const daySlots: string[] = [];
      const dayEndMs =
        new Date(
          localDate.getFullYear(),
          localDate.getMonth(),
          localDate.getDate(),
          dayEnd % 24,
          0,
          0,
          0,
        ).getTime() + (dayEnd >= 24 ? 24 * 60 * 60_000 : 0);

      for (let hour = dayStart; hour < dayEnd; hour++) {
        for (let min = 0; min < 60; min += duration) {
          const localSlotMs = new Date(
            localDate.getFullYear(),
            localDate.getMonth(),
            localDate.getDate(),
            hour,
            min,
            0,
            0,
          ).getTime();
          if (localSlotMs + duration * 60_000 > dayEndMs) continue;

          const utcSlotMs = localSlotMs - tzOffset;
          const slotStart = utcSlotMs;
          const slotEnd = utcSlotMs + duration * 60_000;

          if (slotStart < now.getTime()) continue;
          if (slotHasConflict(slotStart, slotEnd, busy)) continue;
          daySlots.push(new Date(slotStart).toISOString());
        }
      }
      if (daySlots.length > 0) {
        slots.push({ date: dateKey, times: daySlots });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}
