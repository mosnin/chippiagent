export type TriggerOpsAction = 'clear_events' | 'replay_event';

export async function recordTriggerOpsAudit(input: {
  kvUrl: string;
  kvToken: string;
  spaceId: string;
  action: TriggerOpsAction;
  userId: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const key = `agent:trigger:ops:${input.spaceId}`;
  const payload = JSON.stringify({
    action: input.action,
    userId: input.userId,
    detail: input.detail ?? null,
    at: new Date().toISOString(),
  });
  try {
    await fetch(`${input.kvUrl}/lpush/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.kvToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([payload]),
    });
    await fetch(`${input.kvUrl}/ltrim/${encodeURIComponent(key)}/0/199`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.kvToken}` },
    });
  } catch {
    // Best-effort audit; never fail API path.
  }
}
