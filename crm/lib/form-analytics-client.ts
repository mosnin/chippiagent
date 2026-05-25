/**
 * Lightweight client-side tracker for form analytics events.
 *
 * Fire-and-forget — never blocks form UX.
 * Uses sessionStorage for sessionId (persists across refreshes, not across tabs).
 * Batches events and sends periodically to reduce network calls.
 * Uses navigator.sendBeacon for abandon events (reliable on page close).
 */

const ANALYTICS_ENDPOINT = '/api/form-analytics';
const BATCH_INTERVAL_MS = 3_000; // flush every 3 seconds
const SESSION_KEY = 'chippi_fa_session';

// ── Session ID management ────────────────────────────────────────────────────

function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

// ── Event queue & batching ───────────────────────────────────────────────────

type AnalyticsEvent = {
  spaceId: string;
  sessionId: string;
  formConfigVersion?: number;
  eventType: string;
  stepIndex?: number;
  stepTitle?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

let eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueue(event: AnalyticsEvent) {
  eventQueue.push(event);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, BATCH_INTERVAL_MS);
}

function flush() {
  if (eventQueue.length === 0) return;
  const batch = eventQueue.splice(0);

  try {
    fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    }).catch(() => {
      // Silently ignore — analytics are fire-and-forget
    });
  } catch {
    // Silently ignore
  }
}

// ── Step timing ──────────────────────────────────────────────────────────────

// Tracks when the current step was entered (for duration calculation)
let stepEnterTime: number | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

export function trackFormStart(
  spaceId: string,
  formConfigVersion?: number,
) {
  enqueue({
    spaceId,
    sessionId: getSessionId(),
    formConfigVersion,
    eventType: 'form_start',
  });
}

export function trackStepView(
  spaceId: string,
  stepIndex: number,
  stepTitle: string,
  formConfigVersion?: number,
) {
  // Record enter time for duration calculation
  stepEnterTime = Date.now();

  enqueue({
    spaceId,
    sessionId: getSessionId(),
    formConfigVersion,
    eventType: 'step_view',
    stepIndex,
    stepTitle,
  });
}

export function trackStepComplete(
  spaceId: string,
  stepIndex: number,
  stepTitle: string,
  formConfigVersion?: number,
) {
  const durationMs =
    stepEnterTime != null ? Date.now() - stepEnterTime : undefined;
  stepEnterTime = null;

  enqueue({
    spaceId,
    sessionId: getSessionId(),
    formConfigVersion,
    eventType: 'step_complete',
    stepIndex,
    stepTitle,
    durationMs,
  });
}

export function trackFormSubmit(
  spaceId: string,
  formConfigVersion?: number,
) {
  // Flush immediately on submit — don't wait for batch timer
  enqueue({
    spaceId,
    sessionId: getSessionId(),
    formConfigVersion,
    eventType: 'form_submit',
  });
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}

export function trackFormAbandon(
  spaceId: string,
  lastStepIndex: number,
  formConfigVersion?: number,
) {
  const durationMs =
    stepEnterTime != null ? Date.now() - stepEnterTime : undefined;

  const event: AnalyticsEvent = {
    spaceId,
    sessionId: getSessionId(),
    formConfigVersion,
    eventType: 'form_abandon',
    stepIndex: lastStepIndex,
    durationMs,
  };

  // Use sendBeacon for reliable delivery on page close
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const payload = JSON.stringify({ events: [event] });
    navigator.sendBeacon(
      ANALYTICS_ENDPOINT,
      new Blob([payload], { type: 'application/json' }),
    );
  } else {
    // Fallback: try regular fetch with keepalive
    enqueue(event);
    flush();
  }
}

/**
 * Returns a cleanup function to remove the beforeunload listener.
 * Call this in useEffect cleanup.
 */
export function setupAbandonTracking(
  spaceId: string,
  getCurrentStepIndex: () => number,
  getIsSubmitted: () => boolean,
  formConfigVersion?: number,
): () => void {
  const handler = () => {
    if (getIsSubmitted()) return;
    trackFormAbandon(spaceId, getCurrentStepIndex(), formConfigVersion);
  };

  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
