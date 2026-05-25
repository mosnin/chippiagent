/**
 * Per-realtor snapshot for the chat system prompt. Two surfaces:
 *   - `buildPersonalizedSnapshot` — fetches + caches the snapshot per
 *     (space, user). 5-min TTL.
 *   - `renderSnapshot` — turns the snapshot into the markdown the prompt
 *     embeds. Empty snapshot → empty string (the prompt skips the block
 *     rather than printing zeros that sound like a brand-new account).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockByTable: Record<string, { single?: Record<string, unknown> | null; count?: number }> = {};

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        const override = mockByTable[table] ?? {};
        const chain: Record<string, unknown> = {};
        const passthrough = () => chain;
        chain.select = vi.fn(passthrough);
        chain.eq = vi.fn(passthrough);
        chain.is = vi.fn(passthrough);
        chain.lt = vi.fn(passthrough);
        chain.maybeSingle = vi.fn(() =>
          Promise.resolve({ data: override.single ?? null, error: null }),
        );
        chain.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: [], error: null, count: override.count ?? null });
        return chain;
      }),
    },
  };
});

const { activeToolkitsMock } = vi.hoisted(() => ({
  activeToolkitsMock: vi.fn(async () => [] as string[]),
}));
vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: activeToolkitsMock,
}));

import {
  buildPersonalizedSnapshot,
  renderSnapshot,
  __resetPersonalizedSnapshotCacheForTests,
} from '@/lib/ai-tools/personalized-prompt';

beforeEach(() => {
  for (const key of Object.keys(mockByTable)) delete mockByTable[key];
  activeToolkitsMock.mockReset();
  activeToolkitsMock.mockResolvedValue([]);
  __resetPersonalizedSnapshotCacheForTests();
});

describe('buildPersonalizedSnapshot', () => {
  it('returns first name from the User row', async () => {
    mockByTable.User = { single: { name: 'Sarah Chen' } };
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.firstName).toBe('Sarah');
  });

  it('returns null firstName when User row is missing', async () => {
    mockByTable.User = { single: null };
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.firstName).toBeNull();
  });

  it('returns counts from the parallel queries', async () => {
    mockByTable.Deal = { count: 3 };
    mockByTable.AgentDraft = { count: 2 };
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.activeDealCount).toBe(3);
    expect(snap.pendingDraftCount).toBe(2);
  });

  it('looks up connected apps via activeToolkits and resolves names', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.connectedApps).toEqual(['Gmail', 'Slack']);
  });

  it('serves the second call from cache (no second supabase round-trip)', async () => {
    mockByTable.User = { single: { name: 'Sam' } };
    const t = { now: () => 100 };
    await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' }, t);
    // Mutate the mock — if the cache misses, this would surface.
    mockByTable.User = { single: { name: 'Different' } };
    const second = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' }, t);
    expect(second.firstName).toBe('Sam');
  });

  it('expires after the 5-minute TTL', async () => {
    mockByTable.User = { single: { name: 'Original' } };
    let now = 0;
    const t = { now: () => now };
    await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' }, t);
    mockByTable.User = { single: { name: 'Refreshed' } };
    now += 6 * 60_000;
    const second = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' }, t);
    expect(second.firstName).toBe('Refreshed');
  });
});

describe('renderSnapshot', () => {
  const empty = {
    firstName: null,
    activeDealCount: 0,
    hotPersonCount: 0,
    overdueFollowUpCount: 0,
    pendingDraftCount: 0,
    connectedApps: [] as string[],
  };

  it('returns empty string when there is nothing useful to say', () => {
    expect(renderSnapshot(empty)).toBe('');
  });

  it('renders only the lines that have facts', () => {
    const out = renderSnapshot({
      ...empty,
      firstName: 'Sam',
      activeDealCount: 4,
      hotPersonCount: 2,
    });
    expect(out).toContain('Realtor: Sam.');
    expect(out).toContain('Snapshot: 4 active deals, 2 hot persons.');
    expect(out).not.toContain('Connected:');
  });

  it('pluralises facts correctly', () => {
    const single = renderSnapshot({
      ...empty,
      activeDealCount: 1,
      hotPersonCount: 1,
      overdueFollowUpCount: 1,
    });
    expect(single).toContain('1 active deal,');
    expect(single).toContain('1 hot person,');
    expect(single).toContain('1 overdue follow-up.');
  });

  it('lists connected apps when present', () => {
    const out = renderSnapshot({
      ...empty,
      firstName: 'Sam',
      connectedApps: ['Gmail', 'Slack'],
    });
    expect(out).toContain('Connected: Gmail, Slack.');
  });
});
