import { describe, it, expect } from 'vitest';
import { renderTemplate, extractTemplateVariables } from '@/lib/message-templates';

describe('renderTemplate', () => {
  it('substitutes known variables', () => {
    const out = renderTemplate('Hi {{contactFirstName}}, tour at {{tourTime}}?', {
      contactFirstName: 'Jane',
      tourTime: '2 PM',
    });
    expect(out).toBe('Hi Jane, tour at 2 PM?');
  });

  it('drops missing variables rather than leaving stale placeholders', () => {
    const out = renderTemplate('Property: {{propertyAddress}}', {});
    expect(out).toBe('Property: ');
  });

  it('tolerates whitespace inside braces', () => {
    expect(renderTemplate('{{ contactName }}!', { contactName: 'Bob' })).toBe('Bob!');
  });

  it('leaves unrelated braces alone', () => {
    expect(renderTemplate('JSON { key: 1 } here', {})).toBe('JSON { key: 1 } here');
  });

  it('treats unknown keys as empty strings', () => {
    expect(renderTemplate('{{unknown}}', {})).toBe('');
  });
});

describe('extractTemplateVariables', () => {
  it('returns the deduplicated set of variables used', () => {
    const vars = extractTemplateVariables('Hi {{contactName}}, {{contactName}} — tour {{tourDate}}');
    expect(vars.sort()).toEqual(['contactName', 'tourDate']);
  });

  it('returns an empty array when there are no tokens', () => {
    expect(extractTemplateVariables('No tokens here')).toEqual([]);
  });
});
