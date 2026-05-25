/**
 * Routine dispatch — fires the Modal autonomous run for one routine.
 *
 * The Modal endpoint only returns once the whole run finishes, so a dispatch
 * timeout is the normal case here, not a failure: the request landed and the
 * run is in flight. Like every autonomous path, the run DRAFTS — it never
 * sends a message unattended.
 *
 * Shared by the hourly cron (/api/cron/routines) and the "Run now" button.
 */

const DISPATCH_TIMEOUT_MS = 12_000;

export type RoutineRunStatus = 'ok' | 'error';

export const ROUTINE_CADENCES = ['hourly', 'daily', 'weekdays'] as const;
export type RoutineCadence = (typeof ROUTINE_CADENCES)[number];

export async function fireRoutineRun(
  spaceId: string,
  instruction: string,
): Promise<RoutineRunStatus> {
  // Read env at call time, not module load — see /api/cron/agent-sweep for why.
  const url = process.env.MODAL_WEBHOOK_URL ?? '';
  const secret = process.env.AGENT_INTERNAL_SECRET ?? '';
  if (!url || !secret) {
    console.error('[routines] MODAL_WEBHOOK_URL or AGENT_INTERNAL_SECRET missing');
    return 'error';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ space_id: spaceId, secret, instruction }),
      signal: controller.signal,
    });
    return res.ok ? 'ok' : 'error';
  } catch (err) {
    // AbortError: the request was sent and accepted; the Modal endpoint just
    // hasn't returned because the run is still going. That's a success.
    if (err instanceof Error && err.name === 'AbortError') return 'ok';
    console.error('[routines] dispatch failed', err);
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}
