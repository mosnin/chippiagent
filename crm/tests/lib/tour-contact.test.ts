import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escapeIlikeExact,
  emailsMatch,
  normalizeTourEmail,
  pickContactIdByEmail,
} from '@/lib/tour-contact';

describe('tour email matching', () => {
  it('normalizes case and surrounding space', () => {
    expect(normalizeTourEmail('  Jane.Doe@Gmail.com ')).toBe('jane.doe@gmail.com');
  });

  it('escapes ILIKE wildcards that are legal in email local-parts', () => {
    expect(escapeIlikeExact('jane_doe@x.com')).toBe('jane\\_doe@x.com');
    expect(escapeIlikeExact('a%@gmail.com')).toBe('a\\%@gmail.com');
    expect(escapeIlikeExact('a\\b@x.com')).toBe('a\\\\b@x.com');
  });

  it('does not treat underscore as “any character” when picking a contact', () => {
    const rows = [
      { id: 'wrong', email: 'jane.doe@x.com' },
      { id: 'right', email: 'jane_doe@x.com' },
    ];
    expect(pickContactIdByEmail(rows, 'jane_doe@x.com')).toBe('right');
    expect(pickContactIdByEmail(rows, 'jane.doe@x.com')).toBe('wrong');
  });

  it('does not attach a% wildcard emails to every a-prefix address', () => {
    const rows = [
      { id: 'alice', email: 'alice@gmail.com' },
      { id: 'ann', email: 'ann@gmail.com' },
    ];
    expect(pickContactIdByEmail(rows, 'a%@gmail.com')).toBeNull();
  });

  it('matches mixed-case stored emails to a lowercase guest', () => {
    expect(emailsMatch('Jane_Doe@X.com', 'jane_doe@x.com')).toBe(true);
    expect(emailsMatch('Jane.Doe@X.com', 'jane_doe@x.com')).toBe(false);
  });
});

const { from } = vi.hoisted(() => {
  const from = vi.fn();
  return { from };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from },
}));

import { findContactByEmail, resolveOrCreateTourContact } from '@/lib/tour-contact';

function contactQuery(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const pass = () => chain;
  chain.select = vi.fn(pass);
  chain.eq = vi.fn(pass);
  chain.ilike = vi.fn(pass);
  chain.limit = vi.fn(async () => result);
  chain.insert = vi.fn(async () => result);
  return chain;
}

describe('findContactByEmail', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it('uses escaped ILIKE so jane_doe cannot match jane.doe', async () => {
    const exact = contactQuery({ data: [], error: null });
    const fuzzy = contactQuery({
      data: [{ id: 'c_wrong', email: 'jane.doe@x.com' }],
      error: null,
    });
    from.mockReturnValueOnce(exact).mockReturnValueOnce(fuzzy);

    await expect(findContactByEmail('space-1', 'jane_doe@x.com')).resolves.toBeNull();

    expect(fuzzy.ilike).toHaveBeenCalledWith('email', 'jane\\_doe@x.com');
  });

  it('returns the exact lowercase row without falling through to ILIKE', async () => {
    const exact = contactQuery({
      data: [{ id: 'c1', email: 'sam@x.com' }],
      error: null,
    });
    from.mockReturnValueOnce(exact);

    await expect(findContactByEmail('space-1', 'Sam@X.com')).resolves.toEqual({ id: 'c1' });
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe('resolveOrCreateTourContact', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it('retries lookup when insert loses the create race', async () => {
    const missExact = contactQuery({ data: [], error: null });
    const missFuzzy = contactQuery({ data: [], error: null });
    const insert = contactQuery({ data: null, error: { message: 'duplicate' } });
    const retryExact = contactQuery({
      data: [{ id: 'c_won', email: 'sam@x.com' }],
      error: null,
    });
    from
      .mockReturnValueOnce(missExact)
      .mockReturnValueOnce(missFuzzy)
      .mockReturnValueOnce(insert)
      .mockReturnValueOnce(retryExact);

    const id = await resolveOrCreateTourContact({
      spaceId: 'space-1',
      name: 'Sam',
      email: 'sam@x.com',
    });
    expect(id).toBe('c_won');
  });
});
