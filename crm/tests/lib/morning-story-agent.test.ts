/**
 * Integration tests for the OpenAI compose path in `lib/morning-story-agent.ts`.
 *
 * We mock the OpenAI client at the integration boundary via the existing
 * `opts.client` injection seam. The intent isn't to test the SDK — it's to
 * pin our handling of its shapes (success, timeout, error, empty, malformed)
 * and the per-space TTL cache so the brand voice can't silently regress.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  composeAgentSentence,
  __resetMorningAgentCacheForTests,
} from '@/lib/morning-story-agent';
import type { MorningSummary } from '@/app/api/agent/morning/route';

// ── Fixtures ────────────────────────────────────────────────────────────────

const empty: MorningSummary = {
  newPeopleCount: 0,
  hotPeopleCount: 0,
  overdueFollowUpsCount: 0,
  stuckDealsCount: 0,
  closingThisWeekCount: 0,
  draftsCount: 0,
  questionsCount: 0,
  topStuckDeal: null,
  topOverdueFollowUp: null,
  topNewPerson: null,
  topHotPerson: null,
};

const withStuck: MorningSummary = {
  ...empty,
  stuckDealsCount: 1,
  topStuckDeal: { id: 'deal_42', title: 'Chen', daysStuck: 14 },
};

const withOverdue: MorningSummary = {
  ...empty,
  overdueFollowUpsCount: 1,
  topOverdueFollowUp: { id: 'contact_7', name: 'Sarah', daysOverdue: 4 },
};

/**
 * Build a mock OpenAI client whose `chat.completions.create` resolves to a
 * canned ChatCompletion-shaped object. Cast to `any` then back to the real
 * `OpenAI` type at the call site — we only ever exercise the one method.
 */
function mockClient(
  create: (...args: unknown[]) => Promise<unknown>,
): { chat: { completions: { create: ReturnType<typeof vi.fn> } } } {
  return {
    chat: {
      completions: {
        create: vi.fn(create),
      },
    },
  };
}

/** ChatCompletion-shaped success response with one choice. */
function completion(content: string): unknown {
  return {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content },
      },
    ],
  };
}

beforeEach(() => {
  __resetMorningAgentCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Successful compose ──────────────────────────────────────────────────────

describe('composeAgentSentence — happy path', () => {
  it('returns the trimmed sentence the model produced', async () => {
    const client = mockClient(async () =>
      completion("  Chen's been parked for two weeks. Nudge it.  "),
    );
    const out = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBe("Chen's been parked for two weeks. Nudge it.");
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('strips wrapping straight quotes the model added', async () => {
    const client = mockClient(async () =>
      completion('"Sarah\'s been waiting four days. Call her."'),
    );
    const out = await composeAgentSentence('space_a', withOverdue, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBe("Sarah's been waiting four days. Call her.");
  });

  it('strips wrapping smart quotes the model added', async () => {
    const client = mockClient(async () =>
      completion('“Chen has been quiet — nudge it.”'),
    );
    const out = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBe('Chen has been quiet — nudge it.');
  });

  it('passes the model name, system prompt, and named-subject payload', async () => {
    const client = mockClient(async () => completion('ok.'));
    await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    const call = client.chat.completions.create.mock.calls[0]!;
    const body = call[0] as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.messages[0]!.role).toBe('system');
    expect(body.messages[0]!.content).toMatch(/Chippi/);
    const userPayload = JSON.parse(body.messages[1]!.content);
    expect(userPayload.stuckDeal).toEqual({
      id: 'deal_42',
      title: 'Chen',
      daysStuck: 14,
    });
  });
});

// ── Negative shapes: empty / malformed / error ──────────────────────────────

describe('composeAgentSentence — degraded responses', () => {
  it('returns null when the response has no choices', async () => {
    const client = mockClient(async () => ({ choices: [] }));
    const out = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBeNull();
  });

  it('returns null when the message content is missing', async () => {
    const client = mockClient(async () => ({
      choices: [{ message: { role: 'assistant' } }],
    }));
    const out = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBeNull();
  });

  it('returns null when the message content is whitespace only', async () => {
    const client = mockClient(async () => completion('   \n\t  '));
    const out = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBeNull();
  });

  it('returns null when the message content is only quote marks', async () => {
    // After stripping wrapping quotes, the sentence is empty — fall back.
    const client = mockClient(async () => completion('""'));
    const out = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBeNull();
  });

  it('returns null when the response is malformed (missing choices key)', async () => {
    const client = mockClient(async () => ({ id: 'x', object: 'chat.completion' }));
    const out = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBeNull();
  });

  it('returns null when the client throws a network/HTTP error', async () => {
    const client = mockClient(async () => {
      throw new Error('ECONNREFUSED');
    });
    const out = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBeNull();
  });
});

// ── No-named-subject and no-API-key short-circuits ─────────────────────────

describe('composeAgentSentence — short-circuits', () => {
  it('returns null without calling the client when no named subject', async () => {
    const client = mockClient(async () => completion('should not be reached'));
    const out = await composeAgentSentence('space_a', empty, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(out).toBeNull();
    expect(client.chat.completions.create).not.toHaveBeenCalled();
  });

  it('returns null when there is no API key and no injected client', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const out = await composeAgentSentence('space_a', withStuck);
      expect(out).toBeNull();
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });
});

// ── Timeout ────────────────────────────────────────────────────────────────

describe('composeAgentSentence — timeout', () => {
  it('returns null when the client takes longer than 5 seconds', async () => {
    vi.useFakeTimers();

    // Manual deferred: resolve only when the AbortSignal fires. This lets the
    // production setTimeout(controller.abort, 5000) be the thing that ends the
    // race — exactly as in production — without hanging on a real promise.
    const client = mockClient(
      (_body, opts) =>
        new Promise((_resolve, reject) => {
          const signal = (opts as { signal: AbortSignal }).signal;
          signal.addEventListener('abort', () => {
            // OpenAI SDK throws on abort; mirror that.
            reject(new Error('Request was aborted'));
          });
        }),
    );

    const promise = composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });

    // Advance past the 5s timeout. The abort fires, the create() rejects,
    // and the catch returns null.
    await vi.advanceTimersByTimeAsync(5_001);

    const out = await promise;
    expect(out).toBeNull();
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });
});

// ── Cache behavior ─────────────────────────────────────────────────────────

describe('composeAgentSentence — cache', () => {
  it('returns the cached sentence on a second call without invoking the client', async () => {
    const client = mockClient(async () => completion('Chen has been parked.'));
    const first = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    const second = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(first).toBe('Chen has been parked.');
    expect(second).toBe('Chen has been parked.');
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('expires the cache after 5 minutes (uses opts.now to advance time)', async () => {
    const client = mockClient(async () => completion('fresh sentence.'));
    let now = 1_000_000;
    const first = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      now: () => now,
    });
    // Jump past the 5-minute TTL.
    now += 5 * 60 * 1000 + 1;
    const second = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      now: () => now,
    });
    expect(first).toBe('fresh sentence.');
    expect(second).toBe('fresh sentence.');
    expect(client.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('keys the cache on spaceId so cross-tenant calls do not collide', async () => {
    // If the key were just the signature, space_b would get space_a's sentence.
    const client = mockClient(async () => completion('per-tenant sentence.'));
    await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    await composeAgentSentence('space_b', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(client.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('keys the cache on the named-subject signature so subject changes refresh', async () => {
    const client = mockClient(async () => completion('a.'));
    await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    // Same space, different stuck deal — must re-call the model.
    const differentStuck: MorningSummary = {
      ...empty,
      stuckDealsCount: 1,
      topStuckDeal: { id: 'deal_99', title: 'Park', daysStuck: 7 },
    };
    await composeAgentSentence('space_a', differentStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(client.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache null results (timeouts/errors must be retried next call)', async () => {
    let calls = 0;
    const client = mockClient(async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return completion('finally.');
    });
    const first = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    const second = await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(first).toBeNull();
    expect(second).toBe('finally.');
    expect(client.chat.completions.create).toHaveBeenCalledTimes(2);
  });
});

// ── __resetMorningAgentCacheForTests ───────────────────────────────────────

describe('__resetMorningAgentCacheForTests', () => {
  it('clears the cache so a follow-up call hits the client again', async () => {
    const client = mockClient(async () => completion('hello.'));
    await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    // Sanity check: warm cache means no second call.
    await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);

    __resetMorningAgentCacheForTests();

    await composeAgentSentence('space_a', withStuck, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
    });
    expect(client.chat.completions.create).toHaveBeenCalledTimes(2);
  });
});
