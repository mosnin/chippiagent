import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  INBOUND_LEAD_EVENTS,
  INBOUND_MESSAGE_EVENT,
  isInboundLeadEvent,
  isInboundMessageEvent,
  parseImmediateEvents,
} from '@/lib/agent/trigger-policy';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseImmediateEvents', () => {
  it('defaults to all when empty or all', () => {
    expect([...parseImmediateEvents(undefined)].sort()).toEqual([
      'application_submitted',
      'deal_stage_changed',
      'goal_completed',
      'inbound_message',
      'new_lead',
      'tour_completed',
    ]);
    expect([...parseImmediateEvents('all')].sort()).toEqual([
      'application_submitted',
      'deal_stage_changed',
      'goal_completed',
      'inbound_message',
      'new_lead',
      'tour_completed',
    ]);
  });

  it('returns only valid subset', () => {
    expect([...parseImmediateEvents('tour_completed,application_submitted')].sort()).toEqual([
      'application_submitted',
      'tour_completed',
    ]);
  });

  it('fails safe to all on invalid token and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect([...parseImmediateEvents('tour_completed,nope')].sort()).toEqual([
      'application_submitted',
      'deal_stage_changed',
      'goal_completed',
      'inbound_message',
      'new_lead',
      'tour_completed',
    ]);
    expect(warn).toHaveBeenCalled();
  });


  it('treats new_lead and application_submitted as inbound first-touch events', () => {
    expect([...INBOUND_LEAD_EVENTS].sort()).toEqual(['application_submitted', 'new_lead']);
    for (const event of INBOUND_LEAD_EVENTS) {
      expect(isInboundLeadEvent(event)).toBe(true);
    }
    expect(isInboundLeadEvent('tour_completed')).toBe(false);
    expect(isInboundLeadEvent('inbound_message')).toBe(false);
  });

  it('treats inbound_message as the first-touch-reply event', () => {
    expect(INBOUND_MESSAGE_EVENT).toBe('inbound_message');
    expect(isInboundMessageEvent('inbound_message')).toBe(true);
    expect(isInboundMessageEvent('new_lead')).toBe(false);
  });

  it('warns once per repeated invalid config value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseImmediateEvents('new_lead,still_nope');
    parseImmediateEvents('new_lead,still_nope');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
