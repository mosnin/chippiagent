import { describe, it, expect } from 'vitest';
import { levenshtein, normalizedLevenshtein, LEVENSHTEIN_CAP } from '@/lib/draft-feedback';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns the length of the other string when one side is empty', () => {
    expect(levenshtein('', 'hello')).toBe(5);
    expect(levenshtein('hello', '')).toBe(5);
  });

  it('counts a single insertion as 1', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  it('counts a single substitution as 1', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('counts a full replacement as the length of the longer string', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
    expect(levenshtein('abcd', 'wxyz')).toBe(4);
  });

  it('handles realistic edits in a short message', () => {
    // "Hey Maya, want to see it Saturday?" -> "Hi Maya, want to see it Saturday?"
    // Single substring change: "Hey" -> "Hi " (3 edits: substitute e->i, substitute y->space, delete one)
    // We just assert the right ballpark — small, not zero, not full length.
    const a = 'Hey Maya, want to see it Saturday?';
    const b = 'Hi Maya, want to see it Saturday?';
    const d = levenshtein(a, b);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(a.length);
  });

  it('is symmetric', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(levenshtein('sitting', 'kitten'));
    // The classic textbook case: kitten -> sitting is 3 (s/k, i/e, +g).
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('treats curly quotes and em-dashes as single characters', () => {
    // Straight to curly quote: one substitution, one edit.
    expect(levenshtein("don't", 'don’t')).toBe(1);
    // Two hyphens to one em-dash: two deletions, one insertion = 3? No —
    // best is one substitution + one deletion = 2.
    expect(levenshtein('a--b', 'a—b')).toBe(2);
  });

  it('handles emoji as single code points, not surrogate pairs', () => {
    // U+1F600 GRINNING FACE — a single code point, encoded as a UTF-16
    // surrogate pair. A naive char-index implementation would call this 2.
    expect(levenshtein('hi 😀', 'hi 😀')).toBe(0);
    // 'hi ' -> 'hi 😀': one insertion (the emoji code point). If we counted
    // the emoji as a UTF-16 surrogate pair we'd get 2 here.
    expect(levenshtein('hi ', 'hi 😀')).toBe(1);
  });

  it('caps at LEVENSHTEIN_CAP for very long fully-different strings', () => {
    const a = 'a'.repeat(2000);
    const b = 'b'.repeat(2000);
    expect(levenshtein(a, b)).toBe(LEVENSHTEIN_CAP);
  });

  it('caps at LEVENSHTEIN_CAP when one side is empty and the other is huge', () => {
    const long = 'x'.repeat(5000);
    expect(levenshtein('', long)).toBe(LEVENSHTEIN_CAP);
    expect(levenshtein(long, '')).toBe(LEVENSHTEIN_CAP);
  });

  it('returns 0 for two long identical strings (no false positives at scale)', () => {
    const s = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
    expect(levenshtein(s, s)).toBe(0);
  });

  it('handles unicode whitespace and punctuation cleanly', () => {
    // Same words, different separator characters. Each substitution = 1.
    expect(levenshtein('a b', 'a b')).toBe(1); // non-breaking space -> space
    expect(levenshtein('a…', 'a...')).toBe(3); // ellipsis -> three dots
  });
});

describe('normalizedLevenshtein', () => {
  it('treats trailing whitespace as no edit', () => {
    expect(normalizedLevenshtein('Hi Maya,', 'Hi Maya, ')).toBe(0);
    expect(normalizedLevenshtein('Hi Maya,\n', 'Hi Maya,')).toBe(0);
  });

  it('treats leading whitespace as no edit', () => {
    expect(normalizedLevenshtein(' Hi Maya,', 'Hi Maya,')).toBe(0);
    expect(normalizedLevenshtein('\nHi Maya,', 'Hi Maya,')).toBe(0);
  });

  it('treats internal double-spaces as no edit', () => {
    expect(normalizedLevenshtein('Hi  Maya,', 'Hi Maya,')).toBe(0);
    expect(normalizedLevenshtein('one   two   three', 'one two three')).toBe(0);
  });

  it('collapses newline runs: Hi\\n\\nMaya vs Hi\\nMaya is 0', () => {
    expect(normalizedLevenshtein('Hi\n\nMaya', 'Hi\nMaya')).toBe(0);
    // Mixed whitespace runs (tab + spaces + newline) all collapse to one space.
    expect(normalizedLevenshtein('Hi\t \n Maya', 'Hi Maya')).toBe(0);
  });

  it('counts only the real edit, not surrounding whitespace noise', () => {
    // Real content edit, surrounded by whitespace noise that normalizes away.
    // Compare to the raw distance of the cleaned strings — that's the truth.
    const noisy = '  Hey   Maya,\n\n';
    const clean = 'Hi Maya,';
    const real = levenshtein('Hey Maya,', 'Hi Maya,');
    expect(normalizedLevenshtein(noisy, clean)).toBe(real);
  });

  it('still reports a real single-character substitution as 1', () => {
    // Whitespace collapses, but the actual content swap (cat -> bat) is one edit.
    expect(normalizedLevenshtein('cat ', ' bat')).toBe(1);
  });
});
