import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@/lib/html-escape';

describe('escapeHtml', () => {
  it('returns empty string for nullish or empty input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('leaves plain text alone', () => {
    expect(escapeHtml('Alex Johnson')).toBe('Alex Johnson');
  });

  it('escapes stored XSS payloads from intake fields', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(escapeHtml('<script>alert(document.cookie)</script>')).toBe(
      '&lt;script&gt;alert(document.cookie)&lt;/script&gt;',
    );
    expect(escapeHtml(`"><svg/onload=alert(1)>`)).toBe(
      '&quot;&gt;&lt;svg/onload=alert(1)&gt;',
    );
  });

  it('escapes quotes used to break out of HTML attributes', () => {
    expect(escapeHtml('hot" onclick="alert(1)')).toBe(
      'hot&quot; onclick=&quot;alert(1)',
    );
    expect(escapeHtml("it's fine")).toBe('it&#x27;s fine');
  });

  it('escapes ampersands first so entities stay escaped', () => {
    expect(escapeHtml('&lt;already&gt;')).toBe('&amp;lt;already&amp;gt;');
  });
});
