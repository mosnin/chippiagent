/**
 * The connected-apps row picks one of five actions: busy spinner,
 * coming-soon pill, disconnect, reconnect, or connect. The picker is a
 * pure function so we can pin the priority order without rendering.
 *
 * The taste decisions worth pinning:
 *   - `comingSoon` wins over every other state, including `busy`. A
 *     coming-soon row with a spinner would be a lie — there's no real
 *     request in flight, and there's no Composio toolkit behind the
 *     slug to even attempt one against.
 *   - `busy` wins over status because the spinner is a fresh action
 *     the realtor just kicked off.
 *   - `expired` and `failed` both produce "reconnect" — we don't show
 *     "reconnect" vs "fix" as separate verbs, that's two ideas to
 *     remember and the realtor doesn't care which underlying state we
 *     stored. Both mean: tap to fix.
 *   - Default (no connection) is "connect", not "add".
 */

import { describe, it, expect } from 'vitest';
import { pickRowAction } from '@/components/settings/connected-apps-section';

describe('pickRowAction', () => {
  it('coming-soon wins over everything, even busy', () => {
    expect(pickRowAction({ comingSoon: true, status: null, busy: false })).toEqual({
      kind: 'coming-soon',
    });
    expect(pickRowAction({ comingSoon: true, status: null, busy: true })).toEqual({
      kind: 'coming-soon',
    });
    // Even if a stale connection exists somehow, a coming-soon catalog
    // entry must not advertise itself as connectable — render the pill.
    expect(pickRowAction({ comingSoon: true, status: 'active', busy: false })).toEqual({
      kind: 'coming-soon',
    });
  });

  it('busy wins over status when not coming-soon', () => {
    expect(pickRowAction({ comingSoon: false, status: 'active', busy: true })).toEqual({
      kind: 'busy',
    });
    expect(pickRowAction({ comingSoon: false, status: null, busy: true })).toEqual({
      kind: 'busy',
    });
  });

  it('active → disconnect', () => {
    expect(pickRowAction({ comingSoon: false, status: 'active', busy: false })).toEqual({
      kind: 'disconnect',
    });
  });

  it('expired and failed both → reconnect (single verb)', () => {
    expect(pickRowAction({ comingSoon: false, status: 'expired', busy: false })).toEqual({
      kind: 'reconnect',
    });
    expect(pickRowAction({ comingSoon: false, status: 'failed', busy: false })).toEqual({
      kind: 'reconnect',
    });
  });

  it('no connection → connect', () => {
    expect(pickRowAction({ comingSoon: false, status: null, busy: false })).toEqual({
      kind: 'connect',
    });
  });

  it('treats undefined comingSoon as false (catalog rows without the flag are connectable)', () => {
    expect(pickRowAction({ status: null, busy: false })).toEqual({ kind: 'connect' });
  });
});
