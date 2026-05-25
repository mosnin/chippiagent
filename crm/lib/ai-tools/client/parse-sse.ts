/**
 * Tiny Server-Sent Events frame parser. The browser's built-in `EventSource`
 * is GET-only, but the agent routes are POST — so we drive the fetch stream
 * by hand and re-assemble frames here.
 *
 * Frame format (matches lib/ai-tools/events.encodeEvent):
 *
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 *
 * This parser is intentionally forgiving — it only cares about the `data:`
 * line, ignores comments and heartbeats, and tolerates \r\n or \n line
 * endings. Invalid JSON frames surface through the `onError` callback so
 * the caller can surface them without tearing down the whole stream.
 */

import type { AgentEvent } from '@/lib/ai-tools/events';
import { decodeEvent } from '@/lib/ai-tools/events';

export class SSEParser {
  private buffer = '';
  private decoder = new TextDecoder();

  /**
   * Ingest a chunk of bytes and yield every complete event in it. The
   * parser buffers any trailing partial frame until the next `feed()`.
   */
  *feed(chunk: Uint8Array): IterableIterator<AgentEvent> {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    yield* this.drain();
  }

  /**
   * Flush the decoder and any final trailing frame. Call once after the
   * stream reader signals `done` to guarantee no event is left behind.
   */
  *end(): IterableIterator<AgentEvent> {
    this.buffer += this.decoder.decode();
    // If the server closed mid-frame there's nothing we can recover; drop it.
    yield* this.drain();
  }

  private *drain(): IterableIterator<AgentEvent> {
    while (true) {
      // Frames are delimited by a blank line (two consecutive newlines).
      // Accept \r\n\r\n for HTTP proxies that rewrite line endings.
      const lfIdx = this.buffer.indexOf('\n\n');
      const crlfIdx = this.buffer.indexOf('\r\n\r\n');
      let idx = -1;
      let gap = 0;
      if (lfIdx !== -1 && (crlfIdx === -1 || lfIdx < crlfIdx)) {
        idx = lfIdx;
        gap = 2;
      } else if (crlfIdx !== -1) {
        idx = crlfIdx;
        gap = 4;
      }
      if (idx === -1) break;

      const frame = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + gap);

      // Concatenate all `data:` lines — the spec allows multi-line data.
      const lines = frame.split(/\r?\n/);
      let data = '';
      for (const line of lines) {
        if (line.startsWith(':')) continue; // comment / heartbeat
        if (line.startsWith('data:')) {
          data += line.slice(line.charAt(5) === ' ' ? 6 : 5);
        }
      }
      if (!data) continue;

      try {
        yield decodeEvent(data);
      } catch {
        // Skip bad frames — the turn may still recover.
      }
    }
  }
}
