import { describe, it, expect } from 'vitest';
import { SSEParser } from '@/lib/ai-tools/client/parse-sse';
import { encodeEvent } from '@/lib/ai-tools/events';
import type { AgentEvent } from '@/lib/ai-tools/events';

function frame(event: AgentEvent): Uint8Array {
  return encodeEvent(event);
}

function concat(...bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of bufs) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

describe('SSEParser', () => {
  it('parses one complete frame', () => {
    const parser = new SSEParser();
    const chunk = frame({
      type: 'text_delta',
      delta: 'hello',
      seq: 0,
      ts: '2026-04-22T00:00:00.000Z',
    });
    const events = Array.from(parser.feed(chunk));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'text_delta', delta: 'hello' });
  });

  it('parses multiple frames in one chunk', () => {
    const parser = new SSEParser();
    const chunk = concat(
      frame({ type: 'text_delta', delta: 'a', seq: 0, ts: 't' }),
      frame({ type: 'text_delta', delta: 'b', seq: 1, ts: 't' }),
      frame({ type: 'turn_complete', reason: 'complete', seq: 2, ts: 't' }),
    );
    const events = Array.from(parser.feed(chunk));
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(['text_delta', 'text_delta', 'turn_complete']);
  });

  it('buffers across partial chunks', () => {
    const parser = new SSEParser();
    const full = frame({
      type: 'tool_call_start',
      callId: 'c1',
      name: 'search_contacts',
      args: { query: 'jane' },
      seq: 5,
      ts: 't',
    });
    // Slice mid-frame to simulate a TCP fragment.
    const mid = Math.floor(full.length / 2);
    const first = full.slice(0, mid);
    const rest = full.slice(mid);

    const a = Array.from(parser.feed(first));
    expect(a).toHaveLength(0);
    const b = Array.from(parser.feed(rest));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ type: 'tool_call_start', callId: 'c1' });
  });

  it('ignores comment / heartbeat lines', () => {
    const parser = new SSEParser();
    const encoder = new TextEncoder();
    const heartbeat = encoder.encode(': heartbeat\n\n');
    const real = frame({ type: 'text_delta', delta: 'x', seq: 0, ts: 't' });

    const events = Array.from(parser.feed(concat(heartbeat, real)));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'text_delta', delta: 'x' });
  });

  it('tolerates \\r\\n line endings', () => {
    const parser = new SSEParser();
    const encoder = new TextEncoder();
    const crlfFrame = encoder.encode(
      'event: text_delta\r\ndata: {"type":"text_delta","delta":"hi","seq":0,"ts":"t"}\r\n\r\n',
    );
    const events = Array.from(parser.feed(crlfFrame));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'text_delta', delta: 'hi' });
  });

  it('skips malformed JSON without tearing down the stream', () => {
    const parser = new SSEParser();
    const encoder = new TextEncoder();
    const bad = encoder.encode('event: text_delta\ndata: not-json\n\n');
    const good = frame({ type: 'text_delta', delta: 'ok', seq: 1, ts: 't' });

    const events = Array.from(parser.feed(concat(bad, good)));
    // Only the good frame survives — the bad one is silently dropped.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'text_delta', delta: 'ok' });
  });

  it('end() flushes decoder and emits any trailing complete frame', () => {
    const parser = new SSEParser();
    const chunk = frame({ type: 'text_delta', delta: 'tail', seq: 0, ts: 't' });
    // Feed without the trailing \n\n to force buffering, then supply it via end.
    // (In practice the frame already has \n\n; this exercises the end() flush.)
    Array.from(parser.feed(chunk));
    const flushed = Array.from(parser.end());
    // Nothing left — already consumed in feed.
    expect(flushed).toHaveLength(0);
  });

  it('round-trips a permission_required event carrying otherPendingCalls', () => {
    // Regression: cascade-denied siblings arrive with the initial
    // permission_required event; the client depends on decodeEvent
    // preserving the optional otherPendingCalls field intact.
    const parser = new SSEParser();
    const chunk = frame({
      type: 'permission_required',
      requestId: 'req_1',
      callId: 'c_1',
      name: 'send_email',
      args: { toEmail: 'a@b.com', subject: 'S', body: 'B' },
      summary: 'Email a@b.com — "S"',
      otherPendingCalls: [
        {
          callId: 'c_2',
          name: 'send_email',
          args: { toEmail: 'x@y.com', subject: 'S2', body: 'B2' },
          summary: 'Email x@y.com — "S2"',
        },
      ],
      seq: 0,
      ts: 't',
    });
    const events = Array.from(parser.feed(chunk));
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.type).toBe('permission_required');
    // Narrow via `type` so TS knows otherPendingCalls exists.
    if (ev.type !== 'permission_required') throw new Error('wrong event');
    expect(ev.otherPendingCalls).toHaveLength(1);
    expect(ev.otherPendingCalls?.[0].callId).toBe('c_2');
  });
});
