/**
 * `buildContextHint` is the pure helper the recorder uses to translate the
 * URL-driven `?personId=…` / `?dealId=…` params into the wire payload sent
 * to /api/chippi/post-tour. The recorder is otherwise a render-heavy client
 * component; this test pins the only piece of logic that affects what the
 * orchestrator sees.
 *
 * No render — the project doesn't ship jsdom and we're not adding a dep
 * for one helper. The recorder itself is exercised in product.
 */
import { describe, it, expect } from 'vitest';
import { buildContextHint } from '@/components/chippi/post-tour-recorder';

describe('buildContextHint', () => {
  it('returns undefined when no ids are present', () => {
    expect(buildContextHint(null)).toBeUndefined();
    expect(buildContextHint(undefined)).toBeUndefined();
    expect(buildContextHint({})).toBeUndefined();
  });

  it('returns undefined when both ids are empty strings', () => {
    expect(buildContextHint({ personId: '', dealId: '' })).toBeUndefined();
  });

  it('returns undefined when ids are whitespace only', () => {
    // Defensive against a stray `?personId=%20` on the URL — we don't want
    // to send a junk hint that confuses the orchestrator's resolver.
    expect(buildContextHint({ personId: '   ', dealId: '\t\n' })).toBeUndefined();
  });

  it('returns only personId when only personId is provided', () => {
    expect(buildContextHint({ personId: 'abc-123' })).toEqual({ personId: 'abc-123' });
  });

  it('returns only dealId when only dealId is provided', () => {
    expect(buildContextHint({ dealId: 'deal-9' })).toEqual({ dealId: 'deal-9' });
  });

  it('returns both when both are provided', () => {
    expect(buildContextHint({ personId: 'abc-123', dealId: 'deal-9' })).toEqual({
      personId: 'abc-123',
      dealId: 'deal-9',
    });
  });

  it('trims whitespace around ids', () => {
    expect(buildContextHint({ personId: '  abc-123  ' })).toEqual({ personId: 'abc-123' });
  });

  it('drops a null id alongside a valid one', () => {
    expect(buildContextHint({ personId: 'abc-123', dealId: null })).toEqual({
      personId: 'abc-123',
    });
  });
});
