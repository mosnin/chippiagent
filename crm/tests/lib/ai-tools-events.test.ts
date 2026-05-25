import { describe, it, expect } from 'vitest';
import {
  type AgentEvent,
  createSeqCounter,
  decodeEvent,
  encodeEvent,
} from '@/lib/ai-tools/events';

describe('encodeEvent / decodeEvent', () => {
  it('round-trips a text_delta event', () => {
    const ev: AgentEvent = {
      type: 'text_delta',
      seq: 0,
      ts: '2026-04-22T00:00:00.000Z',
      delta: 'Hello ',
    };
    const wire = new TextDecoder().decode(encodeEvent(ev));
    expect(wire).toMatch(/^event: text_delta\ndata: /);
    expect(wire.endsWith('\n\n')).toBe(true);
    const dataLine = wire.split('\n').find((l) => l.startsWith('data: '))!.slice(6);
    expect(decodeEvent(dataLine)).toEqual(ev);
  });

  it('round-trips a tool_call_start event with structured args', () => {
    const ev: AgentEvent = {
      type: 'tool_call_start',
      seq: 3,
      ts: '2026-04-22T00:00:01.000Z',
      callId: 'call_123',
      name: 'search_contacts',
      args: { query: 'Jane', limit: 5 },
      display: 'contacts',
    };
    const dataLine = new TextDecoder()
      .decode(encodeEvent(ev))
      .split('\n')
      .find((l) => l.startsWith('data: '))!
      .slice(6);
    expect(decodeEvent(dataLine)).toEqual(ev);
  });

  it('uses the SSE "event:" header so clients can attach typed listeners', () => {
    const wire = new TextDecoder().decode(
      encodeEvent({
        type: 'permission_required',
        seq: 1,
        ts: '2026-04-22T00:00:00.000Z',
        requestId: 'req_abc',
        callId: 'call_1',
        name: 'send_email',
        args: { to: 'a@b.com' },
        summary: 'Email Alex',
      }),
    );
    expect(wire.startsWith('event: permission_required\n')).toBe(true);
  });

  it('rejects malformed events', () => {
    expect(() => decodeEvent('null')).toThrow(/not an object/);
    expect(() => decodeEvent('{"seq": 1}')).toThrow(/missing type/);
    expect(() => decodeEvent('{"type": "text_delta"}')).toThrow(/missing seq/);
  });
});

describe('createSeqCounter', () => {
  it('produces monotonic 0-indexed values', () => {
    const next = createSeqCounter();
    expect(next()).toBe(0);
    expect(next()).toBe(1);
    expect(next()).toBe(2);
  });

  it('is independent per-turn', () => {
    const turnA = createSeqCounter();
    const turnB = createSeqCounter();
    turnA();
    turnA();
    expect(turnA()).toBe(2);
    expect(turnB()).toBe(0);
  });
});
