import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const requireSpaceOwner = vi.fn();
const from = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: (...args: unknown[]) => requireSpaceOwner(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function makeChain(rows: unknown[] = []): Chain {
  const chain = {} as Chain;
  const pass = () => chain;
  chain.select = vi.fn(pass);
  chain.eq = vi.fn(pass);
  chain.or = vi.fn(pass);
  chain.in = vi.fn(pass);
  chain.limit = vi.fn(async () => ({ data: rows, error: null }));
  return chain;
}

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.resetModules();
    requireSpaceOwner.mockReset();
    from.mockReset();
    requireSpaceOwner.mockResolvedValue({
      userId: 'clerk_1',
      space: { id: 'space_own', slug: 'jane' },
    });
  });

  async function call(url: string) {
    const { GET } = await import('@/app/api/search/route');
    return GET(new NextRequest(url));
  }

  it('refuses to search when slug is missing', async () => {
    const res = await call('http://localhost/api/search?q=jane.doe@gmail.com');
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('does not query another space when the caller is forbidden', async () => {
    requireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await call('http://localhost/api/search?slug=other&q=lead');
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it('scopes every entity query to the authed space and keeps email dots', async () => {
    const contacts = makeChain([{ id: 'c1', name: 'Jane Doe', email: 'jane.doe@gmail.com', type: 'QUALIFICATION' }]);
    const deals = makeChain([]);
    const tours = makeChain([]);
    from.mockImplementation((table: string) => {
      if (table === 'Contact') return contacts;
      if (table === 'Deal') return deals;
      if (table === 'Tour') return tours;
      return makeChain();
    });

    const res = await call('http://localhost/api/search?slug=jane&q=jane.doe@gmail.com');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(contacts.eq).toHaveBeenCalledWith('spaceId', 'space_own');
    expect(deals.eq).toHaveBeenCalledWith('spaceId', 'space_own');
    expect(tours.eq).toHaveBeenCalledWith('spaceId', 'space_own');
    expect(contacts.or).toHaveBeenCalledWith(
      'name.ilike."%jane.doe@gmail.com%",email.ilike."%jane.doe@gmail.com%",phone.ilike."%jane.doe@gmail.com%"',
    );
    expect(body.contacts).toEqual([
      expect.objectContaining({ id: 'c1', email: 'jane.doe@gmail.com' }),
    ]);
  });
});
