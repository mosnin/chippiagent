/**
 * POST /api/tours/gcal sync_tour — a failed PUT must not create a second
 * Google event. Duplicates keep freeBusy marking a slot busy after the
 * tour moves or cancels.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Terminal = { data?: unknown; error?: unknown };
const tableQueues = new Map<string, Terminal[]>();

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
    const terminal = () => {
      const fallback = table === 'GoogleCalendarToken' || table === 'Tour' ? null : [];
      return take(table, fallback);
    };
    const chain: Record<string, unknown> = {};
    const passthrough = ['select', 'eq', 'update', 'upsert', 'delete'];
    for (const method of passthrough) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(async () => terminal());
    chain.single = vi.fn(async () => terminal());
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal()).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((v: string) => v),
  decrypt: vi.fn((v: string) => v),
}));

import { POST } from '@/app/api/tours/gcal/route';
import { requireSpaceOwner } from '@/lib/api-auth';

const mockRequire = vi.mocked(requireSpaceOwner);

const SPACE = { id: 'space_1', slug: 'jane' };

function invoke(body: unknown) {
  const req = new NextRequest('http://localhost/api/tours/gcal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

const savedFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tableQueues.clear();
  mockRequire.mockResolvedValue({ space: SPACE, userId: 'user_1' } as unknown as Awaited<
    ReturnType<typeof requireSpaceOwner>
  >);
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = savedFetch;
});

function seedTokenAndTour(tour: Record<string, unknown>) {
  enqueue('GoogleCalendarToken', {
    data: {
      spaceId: 'space_1',
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      calendarId: 'jane@example.com',
    },
  });
  enqueue('Tour', { data: tour });
  enqueue('Tour', { data: null }); // update
}

describe('POST /api/tours/gcal sync_tour', () => {
  it('does not create a second event when PUT fails with 500', async () => {
    seedTokenAndTour({
      id: 'tour_1',
      guestName: 'Alex',
      guestEmail: 'a@x.com',
      guestPhone: null,
      propertyAddress: '1 Main',
      notes: null,
      startsAt: '2026-08-21T18:00:00.000Z',
      endsAt: '2026-08-21T18:30:00.000Z',
      status: 'scheduled',
      googleEventId: 'evt_old',
    });
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    const res = await invoke({ slug: 'jane', action: 'sync_tour', tourId: 'tour_1' });
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/calendars/jane%40example.com/events/evt_old');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT');
  });

  it('recreates only when Google says the event is gone', async () => {
    seedTokenAndTour({
      id: 'tour_1',
      guestName: 'Alex',
      guestEmail: 'a@x.com',
      guestPhone: null,
      propertyAddress: '1 Main',
      notes: null,
      startsAt: '2026-08-21T18:00:00.000Z',
      endsAt: '2026-08-21T18:30:00.000Z',
      status: 'scheduled',
      googleEventId: 'evt_old',
    });
    fetchMock
      .mockResolvedValueOnce(new Response('gone', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'evt_new' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const res = await invoke({ slug: 'jane', action: 'sync_tour', tourId: 'tour_1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.googleEventId).toBe('evt_new');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('POST');
  });

  it('deletes the Google event when the tour is cancelled', async () => {
    seedTokenAndTour({
      id: 'tour_1',
      guestName: 'Alex',
      guestEmail: 'a@x.com',
      guestPhone: null,
      propertyAddress: '1 Main',
      notes: null,
      startsAt: '2026-08-21T18:00:00.000Z',
      endsAt: '2026-08-21T18:30:00.000Z',
      status: 'cancelled',
      googleEventId: 'evt_old',
    });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const res = await invoke({ slug: 'jane', action: 'sync_tour', tourId: 'tour_1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(true);
    expect(body.googleEventId).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });
});
