/**
 * Brokerage seat-limit helpers (BP3b).
 *
 * "Seats in use" for a brokerage is defined as:
 *   members (rows in BrokerageMembership)
 *   + pending, non-expired invitations (Invitation.status='pending' AND expiresAt > now())
 *
 * Seat limits are driven off the Brokerage.plan / Brokerage.seatLimit columns
 * added by migration BP3a:
 *   - plan:      'starter' | 'team' | 'enterprise'
 *   - seatLimit: integer NULL (starter=5, team=15, enterprise=NULL meaning unlimited)
 *
 * This module is designed to deploy AHEAD of the migration — if the plan/seatLimit
 * columns aren't present yet, we fall back to the strictest sane default
 * (starter / 5). Never silently unlock the cap on infra errors.
 */
import { supabase } from '@/lib/supabase';

export type BrokeragePlan = 'starter' | 'team' | 'enterprise';

export interface SeatUsage {
  plan: BrokeragePlan;
  seatLimit: number | null;
  /** members + pendingInvites */
  used: number;
  members: number;
  pendingInvites: number;
}

export interface SeatCheckResult {
  ok: boolean;
  usage: SeatUsage;
  /** Only set when ok === false: how many more would land the caller over the cap. */
  needed?: number;
}

const DEFAULT_PLAN: BrokeragePlan = 'starter';
const DEFAULT_SEAT_LIMIT = 5;

function isValidPlan(value: unknown): value is BrokeragePlan {
  return value === 'starter' || value === 'team' || value === 'enterprise';
}

/**
 * Load plan + seatLimit for a brokerage with pre-migration resilience.
 * If the columns don't exist yet (BP3a hasn't run), fall back to starter/5 —
 * never fall back to "unlimited" because that would silently disable the cap.
 */
async function loadPlan(
  brokerageId: string
): Promise<{ plan: BrokeragePlan; seatLimit: number | null }> {
  try {
    const { data, error } = await supabase
      .from('Brokerage')
      .select('plan, seatLimit')
      .eq('id', brokerageId)
      .maybeSingle();

    if (error || !data) {
      return { plan: DEFAULT_PLAN, seatLimit: DEFAULT_SEAT_LIMIT };
    }

    const row = data as { plan?: unknown; seatLimit?: unknown };
    const plan: BrokeragePlan = isValidPlan(row.plan) ? row.plan : DEFAULT_PLAN;

    let seatLimit: number | null;
    if (row.seatLimit === null || row.seatLimit === undefined) {
      // Enterprise is explicitly NULL = unlimited. Starter/team with a null value
      // shouldn't happen per migration, but if it does, fall back to plan default.
      seatLimit = plan === 'enterprise' ? null : DEFAULT_SEAT_LIMIT;
    } else if (typeof row.seatLimit === 'number') {
      seatLimit = row.seatLimit;
    } else {
      seatLimit = DEFAULT_SEAT_LIMIT;
    }

    return { plan, seatLimit };
  } catch {
    // Columns missing entirely (pre-migration) or other client error.
    return { plan: DEFAULT_PLAN, seatLimit: DEFAULT_SEAT_LIMIT };
  }
}

/**
 * Count BrokerageMembership rows for a brokerage.
 * Returns null on error so the caller can decide to fail-open.
 */
async function countMembers(brokerageId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('BrokerageMembership')
      .select('*', { count: 'exact', head: true })
      .eq('brokerageId', brokerageId);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/**
 * Count pending, non-expired invitations for a brokerage.
 * Returns null on error so the caller can decide to fail-open.
 */
async function countPendingInvites(brokerageId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('Invitation')
      .select('*', { count: 'exact', head: true })
      .eq('brokerageId', brokerageId)
      .eq('status', 'pending')
      .gt('expiresAt', new Date().toISOString());
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/**
 * Resolve current seat usage (plan + members + pending invites) for a brokerage.
 * On infra error, counts fall back to 0 so the caller sees a "clean slate"
 * rather than a phantom overage — checkSeatCapacity() is the surface that
 * enforces fail-open semantics.
 */
export async function getSeatUsage(brokerageId: string): Promise<SeatUsage> {
  const [{ plan, seatLimit }, members, pendingInvites] = await Promise.all([
    loadPlan(brokerageId),
    countMembers(brokerageId),
    countPendingInvites(brokerageId),
  ]);

  const safeMembers = members ?? 0;
  const safePending = pendingInvites ?? 0;

  return {
    plan,
    seatLimit,
    members: safeMembers,
    pendingInvites: safePending,
    used: safeMembers + safePending,
  };
}

/**
 * Check whether `additional` new seats can be added to a brokerage.
 *
 * Rules:
 *  - seatLimit === null → always ok (enterprise / unlimited).
 *  - used + additional <= seatLimit → ok.
 *  - Otherwise → not ok; `needed` echoes back `additional` so the UI can tell
 *    the user how many invites it was trying to send.
 *
 * Fail-closed on infra errors: if either count sub-query returned null
 * (Supabase flap), we REFUSE the invite rather than silently leak past the
 * seat cap. An earlier revision failed open under the reasoning that
 * blocking legitimate invites was worse; an audit flipped that trade-off:
 * a transient 402 during an infra incident is recoverable in seconds, a
 * silent overage against a billing cap is detected weeks later when the
 * customer reconciles their seat bill. The plan load itself still fails
 * closed to starter/5 (safe floor) so a missing `plan` column
 * (pre-migration) doesn't unlock the brokerage.
 */
export async function checkSeatCapacity(
  brokerageId: string,
  additional: number
): Promise<SeatCheckResult> {
  const [{ plan, seatLimit }, membersResult, pendingResult] = await Promise.all([
    loadPlan(brokerageId),
    countMembers(brokerageId),
    countPendingInvites(brokerageId),
  ]);

  // Infra error on either count → fail closed.
  if (membersResult === null || pendingResult === null) {
    const requested = Math.max(0, Math.floor(additional));
    const usage: SeatUsage = {
      plan,
      seatLimit,
      members: membersResult ?? 0,
      pendingInvites: pendingResult ?? 0,
      used: (membersResult ?? 0) + (pendingResult ?? 0),
    };
    return { ok: false, usage, needed: requested };
  }

  const usage: SeatUsage = {
    plan,
    seatLimit,
    members: membersResult,
    pendingInvites: pendingResult,
    used: membersResult + pendingResult,
  };

  // Unlimited plan — always ok.
  if (seatLimit === null) {
    return { ok: true, usage };
  }

  const requested = Math.max(0, Math.floor(additional));
  if (usage.used + requested <= seatLimit) {
    return { ok: true, usage };
  }

  return { ok: false, usage, needed: requested };
}
