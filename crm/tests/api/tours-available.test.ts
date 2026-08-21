/**
 * GET /api/tours/available — the public slot list is the only GCal gate
 * in front of booking. book_tour_atomic does not re-check Google Calendar.
 *
 * Guards:
 *   - Tour conflicts are space-wide (not filtered by propertyProfileId)
 *   - Tour query uses interval overlap, not startsAt-in-range
 *   - Connected GCal + failed freeBusy → 503 (fail closed)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Terminal = { data?: unknown; error?: unknown };
const tableQueues = new Map<string, Terminal[]>();
const tableCalls: Array<{ table: string; methods: Array<[string, unknown[]]> }> = [];

function enqueue(table: string, terminal: Terminal) {
  const q = tableQueues.get(table) ?? [];
  q.push(terminal);
  tableQueues.set(table, q);
}

function take(table: string, fallback: unknown): Terminal {
  const q = tableQueues.get(table) ?? [];
  return q.shift() ?? { data: fallback, error: null };
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const methods: Array<[string, unknown[]]> = [];
    tableCalls.push({ table, methods });
    const terminal = () => {
      const fallback = table === 'GoogleCalendarToken' || table === 'SpaceSetting' ? null : [];
      return take(table, fallback);
    };
    const chain: Record<string, unknown> = {};
    const passthrough = [
      'select',
      'eq',
      'in',
      'gt',
      'gte',
      'lt',
      'lte',
      'not',
      'order',
      'limit',
      'update',
    ];
    for (const method of passthrough) {
      chain[method] = vi.fn((...args: unknown[]) => {
        methods.push([method, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(async () => terminal());
    chain.single = vi.fn(async () => terminal());
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal()).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/space', () => ({
  getSpaceFromSlug: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '1.1.1.1'),
}));

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((v: string) => v),
}));

import { GET } from '@/app/api/tours/available/route';
import { getSpaceFromSlug } from '@/lib/space';

const mockGetSpace = vi.mocked(getSpaceFromSlug);

const SPACE = {
  id: 'space_1',
  slug: 'jane',
  name: 'Jane Realty',
  emoji: null,
  ownerId: 'user_1',
  brokerageId: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  stripeSubscriptionStatus: 'active',
};

function seedHappyPath(opts?: { gcalToken?: boolean; tours?: unknown[] }) {
  enqueue('SpaceSetting', {
    data: {
      tourDuration: 30,
      tourStartHour: 9,
      tourEndHour: 12,
      tourDaysAvailable: [1, 2, 3, 4, 5],
      timezone: 'UTC',
      tourBufferMinutes: 0,
      tourBlockedDates: [],
    },
  });
  enqueue('Tour', { data: opts?.tours ?? [] });
  enqueue('CalendarEvent', { data: [] });
  enqueue('GoogleCalendarToken', {
    data: opts?.gcalToken
      ? {
          spaceId: 'space_1',
          accessToken: 'tok',
          refreshToken: 'ref',
          expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          calendarId: 'primary',
        }
      : null,
  });
  enqueue('TourAvailabilityOverride', { data: [] });
  enqueue('TourPropertyProfile', { data: [] });
}

function invoke(query: string) {
  const req = new NextRequest(`http://localhost/api/tours/available?${query}`);
  return GET(req);
}

const savedFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tableQueues.clear();
  tableCalls.length = 0;
  mockGetSpace.mockResolvedValue(SPACE as Awaited<ReturnType<typeof getSpaceFromSlug>>);
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = savedFetch;
});

describe('GET /api/tours/available', () => {
  it('queries tours space-wide with interval overlap, even when propertyId is set', async () => {
    enqueue('SpaceSetting', {
      data: {
        tourDuration: 30,
        tourStartHour: 9,
        tourEndHour: 12,
        tourDaysAvailable: [1, 2, 3, 4, 5],
        timezone: 'UTC',
        tourBufferMinutes: 15,
        tourBlockedDates: [],
      },
    });
    enqueue('TourPropertyProfile', {
      data: {
        id: 'prop_a',
        tourDuration: 30,
        startHour: 9,
        endHour: 12,
        daysAvailable: [1, 2, 3, 4, 5],
        bufferMinutes: 15,
      },
    });
    enqueue('Tour', { data: [] });
    enqueue('CalendarEvent', { data: [] });
    enqueue('GoogleCalendarToken', { data: null });
    enqueue('TourAvailabilityOverride', { data: [] });
    enqueue('TourPropertyProfile', { data: [] });

    const res = await invoke('slug=jane&propertyId=prop_a');
    expect(res.status).toBe(200);

    const tourCall = tableCalls.find((c) => c.table === 'Tour');
    expect(tourCall).toBeTruthy();
    const methods = tourCall!.methods.map(([name]) => name);
    expect(methods).toContain('lt');
    expect(methods).toContain('gt');
    expect(tourCall!.methods.some(([name, args]) => name === 'eq' && args[0] === 'propertyProfileId')).toBe(
      false,
    );
    expect(tourCall!.methods.some(([name, args]) => name === 'eq' && args[0] === 'spaceId')).toBe(true);
  });

  it('returns 503 when Google Calendar is connected but freeBusy fails', async () => {
    seedHappyPath({ gcalToken: true });
    fetchMock.mockResolvedValue(
      new Response('quota', { status: 429, headers: { 'Content-Type': 'text/plain' } }),
    );

    const res = await invoke('slug=jane');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.slots).toEqual([]);
    expect(body.error).toBe('Calendar unavailable');
  });

  it('returns 503 when freeBusy succeeds but the calendar reports errors', async () => {
    seedHappyPath({ gcalToken: true });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          calendars: { primary: { errors: [{ reason: 'notFound' }] } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await invoke('slug=jane');
    expect(res.status).toBe(503);
  });

  it('offers slots when Google Calendar is not connected', async () => {
    seedHappyPath({ gcalToken: false });
    const res = await invoke('slug=jane&date=2026-08-21');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.slots)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
