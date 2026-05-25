import { describe, it, expect } from 'vitest';
import { normalizePhone, applicationFingerprintKey } from '@/lib/public-application';

describe('normalizePhone', () => {
  it('strips all non-digit characters', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567');
    expect(normalizePhone('+1-555-123-4567')).toBe('15551234567');
    expect(normalizePhone('5551234567')).toBe('5551234567');
  });

  it('handles empty input', () => {
    expect(normalizePhone('')).toBe('');
  });
});

describe('applicationFingerprintKey', () => {
  const base = { slug: 'test', legalName: 'John Doe', phone: '(555) 123-4567', email: 'john@example.com' };

  it('is deterministic', () => {
    expect(applicationFingerprintKey(base)).toBe(applicationFingerprintKey(base));
  });

  it('normalizes name (case, whitespace)', () => {
    const a = applicationFingerprintKey(base);
    const b = applicationFingerprintKey({ ...base, legalName: '  JOHN DOE  ' });
    expect(a).toBe(b);
  });

  it('normalizes phone formatting', () => {
    const a = applicationFingerprintKey(base);
    const b = applicationFingerprintKey({ ...base, phone: '555-123-4567' });
    expect(a).toBe(b);
  });

  it('normalizes email (case, whitespace)', () => {
    const a = applicationFingerprintKey(base);
    const b = applicationFingerprintKey({ ...base, email: '  JOHN@EXAMPLE.COM  ' });
    expect(a).toBe(b);
  });

  it('differs for different people', () => {
    const a = applicationFingerprintKey({ ...base, legalName: 'John' });
    const b = applicationFingerprintKey({ ...base, legalName: 'Jane' });
    expect(a).not.toBe(b);
  });

  it('differs for different slugs', () => {
    const a = applicationFingerprintKey({ ...base, slug: 'space-a' });
    const b = applicationFingerprintKey({ ...base, slug: 'space-b' });
    expect(a).not.toBe(b);
  });
});
