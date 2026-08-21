import { describe, it, expect } from 'vitest';
import { isAgentContactDataCurrent } from '@/components/agent/agent-contact-panel';

describe('isAgentContactDataCurrent', () => {
  it('rejects null so a previous contact cannot linger on the next page', () => {
    expect(isAgentContactDataCurrent(null, 'c_bob')).toBe(false);
  });

  it('rejects a payload that belongs to a different contact', () => {
    expect(isAgentContactDataCurrent({ contactId: 'c_alice' }, 'c_bob')).toBe(false);
  });

  it('accepts a payload that matches the contact on screen', () => {
    expect(isAgentContactDataCurrent({ contactId: 'c_bob' }, 'c_bob')).toBe(true);
  });
});
