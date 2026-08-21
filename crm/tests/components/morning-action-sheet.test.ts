import { describe, it, expect } from 'vitest';
import { resolveMorningSendOutcome } from '@/components/chippi/morning-action-sheet';

describe('resolveMorningSendOutcome', () => {
  it('treats a successful delivery as sent', () => {
    expect(resolveMorningSendOutcome({ sent: true })).toBe('sent');
  });

  it('does not celebrate a failed delivery as a send', () => {
    expect(resolveMorningSendOutcome({ sent: false, error: 'telnyx_timeout' })).toBe('failed');
  });

  it('keeps the not-configured half-win separate from failure', () => {
    expect(resolveMorningSendOutcome({ sent: false, error: 'not_configured' })).toBe(
      'not_configured',
    );
  });

  it('treats a 200 with no delivery payload as sent (insert-only success)', () => {
    expect(resolveMorningSendOutcome(undefined)).toBe('sent');
    expect(resolveMorningSendOutcome(null)).toBe('sent');
  });
});
