import { describe, it, expect } from 'vitest';
import { normalizeSlug, isValidSlug, buildIntakePath } from '@/lib/intake';

describe('normalizeSlug', () => {
  it('lowercases input', () => {
    expect(normalizeSlug('My-Space')).toBe('my-space');
  });

  it('strips invalid characters', () => {
    expect(normalizeSlug('hello world!')).toBe('helloworld');
    expect(normalizeSlug('special@#$chars')).toBe('specialchars');
  });

  it('trims whitespace', () => {
    expect(normalizeSlug('  spaces  ')).toBe('spaces');
  });
});

describe('isValidSlug', () => {
  it('accepts valid slugs', () => {
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('my-space')).toBe(true);
    expect(isValidSlug('agent-smith-123')).toBe(true);
  });

  it('rejects slugs shorter than 3 chars', () => {
    expect(isValidSlug('ab')).toBe(false);
  });

  it('rejects unnormalized slugs', () => {
    expect(isValidSlug('AB')).toBe(false);
    expect(isValidSlug('a b')).toBe(false);
  });

  it('rejects reserved slugs', () => {
    expect(isValidSlug('admin')).toBe(false);
    expect(isValidSlug('api')).toBe(false);
    expect(isValidSlug('apply')).toBe(false);
    expect(isValidSlug('webhook')).toBe(false);
  });

  it('rejects api-/admin- prefixes', () => {
    expect(isValidSlug('api-anything')).toBe(false);
    expect(isValidSlug('admin-tools')).toBe(false);
  });
});

describe('buildIntakePath', () => {
  it('produces path-based URL, never subdomain', () => {
    const path = buildIntakePath('my-space');
    expect(path).toBe('/apply/my-space');
    expect(path.includes('my-space.')).toBe(false);
  });
});
