import { describe, expect, it } from 'vitest';
import { postgrestIlikeOr, quoteIlikePattern } from '@/lib/search-ilike';

describe('quoteIlikePattern', () => {
  it('keeps dots so email searches can match', () => {
    expect(quoteIlikePattern('jane.doe@gmail.com')).toBe('"%jane.doe@gmail.com%"');
  });

  it('keeps phone punctuation', () => {
    expect(quoteIlikePattern('(555) 123-4567')).toBe('"%(555) 123-4567%"');
  });

  it('escapes ILIKE wildcards', () => {
    expect(quoteIlikePattern('100%_ok')).toBe('"%100\\%\\_ok%"');
  });

  it('doubles embedded quotes for PostgREST', () => {
    expect(quoteIlikePattern('say "hi"')).toBe('"%say ""hi""%"');
  });

  it('returns null for blank input', () => {
    expect(quoteIlikePattern('   ')).toBeNull();
    expect(quoteIlikePattern('')).toBeNull();
  });
});

describe('postgrestIlikeOr', () => {
  it('builds a quoted or-filter across columns', () => {
    expect(postgrestIlikeOr('jane.doe@gmail.com', ['name', 'email', 'phone'])).toBe(
      'name.ilike."%jane.doe@gmail.com%",email.ilike."%jane.doe@gmail.com%",phone.ilike."%jane.doe@gmail.com%"',
    );
  });

  it('returns null when there are no columns', () => {
    expect(postgrestIlikeOr('jane', [])).toBeNull();
  });
});
