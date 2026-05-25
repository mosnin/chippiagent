export function triggerOpsEnabled(): boolean {
  const v = process.env.AGENT_TRIGGER_OPS_ENABLED;
  if (!v) return true;
  const norm = v.trim().toLowerCase();
  return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'on';
}


export function triggerOpsAuthorized(req: Request): boolean {
  const required = process.env.AGENT_TRIGGER_OPS_SECRET?.trim();
  // Operator-grade endpoints — read/clear the trigger log, replay events,
  // edit trigger config. No realtor UI calls them. With no secret set we
  // fail CLOSED: an unset secret LOCKS these endpoints rather than leaving
  // a destructive surface (DELETE clear-log, replay) open to every signed-in
  // user. Configure AGENT_TRIGGER_OPS_SECRET to enable operator access.
  if (!required) return false;
  const got = req.headers.get('x-agent-ops-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return got === required;
}
