import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getSpaceByOwnerId } from '@/lib/space';
import { assignLeadToRealtor } from '@/lib/broker-assign-lead';
import { z } from 'zod';

const commandSchema = z.object({
  command: z.string().min(1),
  args: z.string().optional().default(''),
  brokerageId: z.string().min(1),
});

/**
 * POST /api/broker/chat-command
 *
 * Executes a slash command from the broker team chat and returns
 * formatted text results.
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = commandSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid data', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { command, args, brokerageId } = parsed.data;

  if (brokerageId !== ctx.brokerage.id) {
    return NextResponse.json({ error: 'Brokerage mismatch' }, { status: 403 });
  }

  try {
    const result = await executeCommand(command, args, ctx.brokerage, ctx.dbUserId);
    return NextResponse.json({ result });
  } catch (error) {
    console.error('[chat-command] error', { command, error });
    return NextResponse.json({ error: 'Command failed' }, { status: 500 });
  }
}

async function executeCommand(
  command: string,
  args: string,
  brokerage: { id: string; ownerId: string; name: string },
  dbUserId: string,
): Promise<string> {
  switch (command) {
    case '/status':
      return handleStatus(brokerage);
    case '/leads':
      return handleLeads(brokerage);
    case '/pipeline':
      return handlePipeline(brokerage);
    case '/assign':
      return handleAssign(args, brokerage, dbUserId);
    case '/tours-today':
      return handleToursToday(brokerage);
    case '/followups':
      return handleFollowups(brokerage);
    case '/help':
      return handleHelp();
    default:
      return `Unknown command: ${command}. Type /help for available commands.`;
  }
}

// ── /status ──────────────────────────────────────────────────────────────────

async function handleStatus(brokerage: { id: string; name: string }) {
  const { data: members } = await supabase
    .from('BrokerageMembership')
    .select('userId, role')
    .eq('brokerageId', brokerage.id);

  if (!members?.length) {
    return 'No members found in this brokerage.';
  }

  const userIds = members.map((m) => m.userId);
  const { data: users } = await supabase
    .from('User')
    .select('id, name, email, updatedAt')
    .in('id', userIds);

  const userMap = new Map(
    (users ?? []).map((u) => [u.id, u]),
  );

  const lines = members.map((m) => {
    const user = userMap.get(m.userId);
    const name = user?.name ?? user?.email ?? 'Unknown';
    const roleLabel =
      m.role === 'broker_owner'
        ? 'Owner'
        : m.role === 'broker_admin'
          ? 'Admin'
          : 'Realtor';
    const lastActive = user?.updatedAt
      ? timeAgo(new Date(user.updatedAt))
      : 'unknown';
    return `  ${roleLabel === 'Owner' ? '\u{1F451}' : roleLabel === 'Admin' ? '\u{1F6E1}\uFE0F' : '\u{1F464}'} ${name} (${roleLabel}) -- last active ${lastActive}`;
  });

  return `Team Status -- ${brokerage.name}\n${lines.join('\n')}\n\nTotal: ${members.length} member${members.length !== 1 ? 's' : ''}`;
}

// ── /leads ───────────────────────────────────────────────────────────────────

async function handleLeads(brokerage: { ownerId: string }) {
  const space = await getSpaceByOwnerId(brokerage.ownerId);
  if (!space) return 'Broker space not found.';

  // Count unassigned leads (contacts tagged as brokerage-lead but NOT assigned)
  const { data: allLeads } = await supabase
    .from('Contact')
    .select('id, tags, scoreLabel')
    .eq('spaceId', space.id);

  const leads = (allLeads ?? []).filter(
    (c) => !(c.tags ?? []).includes('assigned'),
  );

  const hot = leads.filter((c) => c.scoreLabel === 'hot').length;
  const warm = leads.filter((c) => c.scoreLabel === 'warm').length;
  const cold = leads.filter((c) => c.scoreLabel === 'cold').length;
  const unscored = leads.length - hot - warm - cold;

  return `Unassigned Leads: ${leads.length}\n  \u{1F525} Hot: ${hot}\n  \u{1F7E1} Warm: ${warm}\n  \u{1F535} Cold: ${cold}${unscored > 0 ? `\n  \u{26AA} Unscored: ${unscored}` : ''}`;
}

// ── /pipeline ────────────────────────────────────────────────────────────────

async function handlePipeline(brokerage: { id: string }) {
  // Get all member spaces
  const { data: members } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id);

  if (!members?.length) return 'No members in this brokerage.';

  const userIds = members.map((m) => m.userId);
  const { data: spaces } = await supabase
    .from('Space')
    .select('id')
    .in('ownerId', userIds);

  if (!spaces?.length) return 'No member spaces found.';

  const spaceIds = spaces.map((s) => s.id);

  // Get all deal stages across member spaces
  const { data: stages } = await supabase
    .from('DealStage')
    .select('id, name, spaceId')
    .in('spaceId', spaceIds);

  // Get all deals across member spaces
  const { data: deals } = await supabase
    .from('Deal')
    .select('id, value, stageId')
    .in('spaceId', spaceIds);

  if (!deals?.length) return 'No deals in pipeline across the team.';

  const stageMap = new Map(
    (stages ?? []).map((s) => [s.id, s.name]),
  );

  // Aggregate by stage name
  const stageAgg: Record<string, { count: number; value: number }> = {};
  for (const deal of deals) {
    const stageName = stageMap.get(deal.stageId) ?? 'Unknown';
    if (!stageAgg[stageName]) stageAgg[stageName] = { count: 0, value: 0 };
    stageAgg[stageName].count++;
    stageAgg[stageName].value += deal.value ?? 0;
  }

  const totalValue = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);

  const lines = Object.entries(stageAgg).map(
    ([stage, { count, value }]) =>
      `  ${stage}: ${count} deal${count !== 1 ? 's' : ''} (${formatMoney(value)})`,
  );

  return `Pipeline Summary\n${lines.join('\n')}\n\nTotal: ${deals.length} deal${deals.length !== 1 ? 's' : ''} worth ${formatMoney(totalValue)}`;
}

// ── /assign ──────────────────────────────────────────────────────────────────

async function handleAssign(
  args: string,
  brokerage: { id: string; ownerId: string; name: string },
  dbUserId: string,
) {
  // Parse: /assign @LeadName @RealtorName
  const mentions = args.match(/@([^@]+)/g);
  if (!mentions || mentions.length < 2) {
    return 'Usage: /assign @leadname @realtorname\nExample: /assign @John Smith @Jane Doe';
  }

  const leadName = mentions[0].slice(1).trim();
  const realtorName = mentions[1].slice(1).trim();

  // Find lead in broker space
  const space = await getSpaceByOwnerId(brokerage.ownerId);
  if (!space) return 'Broker space not found.';

  const { data: leads } = await supabase
    .from('Contact')
    .select('id, name, tags')
    .eq('spaceId', space.id)
    .ilike('name', `%${leadName}%`)
    .limit(5);

  const unassignedLeads = (leads ?? []).filter(
    (c) => !(c.tags ?? []).includes('assigned'),
  );

  if (!unassignedLeads.length) {
    return `No unassigned lead found matching "${leadName}".`;
  }

  // Find realtor member
  const { data: members } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id);

  if (!members?.length) return 'No members found.';

  const { data: users } = await supabase
    .from('User')
    .select('id, name, email')
    .in(
      'id',
      members.map((m) => m.userId),
    );

  const matchedRealtor = (users ?? []).find(
    (u) =>
      (u.name ?? u.email ?? '')
        .toLowerCase()
        .includes(realtorName.toLowerCase()),
  );

  if (!matchedRealtor) {
    return `No team member found matching "${realtorName}".`;
  }

  // Assign directly via the shared helper. The previous version POSTed to
  // /api/broker/assign-lead with no session cookie, so requireBroker() there
  // always 403'd — the command matched the lead but never assigned it.
  const lead = unassignedLeads[0];
  const result = await assignLeadToRealtor({
    brokerage,
    assignedByUserId: dbUserId,
    contactId: lead.id,
    realtorUserId: matchedRealtor.id,
  });

  if (result.ok) {
    return `Lead "${lead.name}" assigned to ${matchedRealtor.name ?? matchedRealtor.email}`;
  }
  return `Assignment failed: ${result.error}`;
}

// ── /tours-today ─────────────────────────────────────────────────────────────

async function handleToursToday(brokerage: { id: string }) {
  const { data: members } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id);

  if (!members?.length) return 'No members in this brokerage.';

  const userIds = members.map((m) => m.userId);
  const { data: spaces } = await supabase
    .from('Space')
    .select('id, ownerId')
    .in('ownerId', userIds);

  if (!spaces?.length) return 'No member spaces found.';

  // Get user names for mapping
  const { data: users } = await supabase
    .from('User')
    .select('id, name, email')
    .in('id', userIds);
  const userMap = new Map(
    (users ?? []).map((u) => [u.id, u.name ?? u.email ?? 'Unknown']),
  );
  const spaceOwnerMap = new Map(
    spaces.map((s) => [s.id, s.ownerId]),
  );

  const spaceIds = spaces.map((s) => s.id);

  // Today's date range in UTC
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).toISOString();

  const { data: tours } = await supabase
    .from('Tour')
    .select('id, guestName, propertyAddress, startsAt, status, spaceId')
    .in('spaceId', spaceIds)
    .gte('startsAt', startOfDay)
    .lt('startsAt', endOfDay)
    .order('startsAt', { ascending: true });

  if (!tours?.length) return 'No tours scheduled for today.';

  const lines = tours.map((t) => {
    const time = new Date(t.startsAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const ownerId = spaceOwnerMap.get(t.spaceId) ?? '';
    const agentName = userMap.get(ownerId) ?? 'Unknown';
    const statusIcon =
      t.status === 'confirmed'
        ? '\u2705'
        : t.status === 'cancelled'
          ? '\u274C'
          : t.status === 'completed'
            ? '\u2705'
            : '\u{1F4C5}';
    return `  ${statusIcon} ${time} - ${t.guestName} at ${t.propertyAddress ?? 'TBD'} (${agentName})`;
  });

  return `Today's Tours (${tours.length})\n${lines.join('\n')}`;
}

// ── /followups ───────────────────────────────────────────────────────────────

async function handleFollowups(brokerage: { id: string }) {
  const { data: members } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id);

  if (!members?.length) return 'No members in this brokerage.';

  const userIds = members.map((m) => m.userId);
  const { data: spaces } = await supabase
    .from('Space')
    .select('id, ownerId')
    .in('ownerId', userIds);

  if (!spaces?.length) return 'No member spaces found.';

  const { data: users } = await supabase
    .from('User')
    .select('id, name, email')
    .in('id', userIds);
  const userMap = new Map(
    (users ?? []).map((u) => [u.id, u.name ?? u.email ?? 'Unknown']),
  );
  const spaceOwnerMap = new Map(
    spaces.map((s) => [s.id, s.ownerId]),
  );

  const spaceIds = spaces.map((s) => s.id);
  const now = new Date().toISOString();

  const { data: contacts } = await supabase
    .from('Contact')
    .select('id, name, followUpAt, spaceId')
    .in('spaceId', spaceIds)
    .not('followUpAt', 'is', null)
    .lte('followUpAt', now)
    .order('followUpAt', { ascending: true })
    .limit(20);

  if (!contacts?.length) return 'No overdue follow-ups across the team.';

  const lines = contacts.map((c) => {
    const ownerId = spaceOwnerMap.get(c.spaceId) ?? '';
    const agentName = userMap.get(ownerId) ?? 'Unknown';
    const dueDate = c.followUpAt
      ? new Date(c.followUpAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      : '';
    return `  \u{23F0} ${c.name} - due ${dueDate} (${agentName})`;
  });

  return `Overdue Follow-ups (${contacts.length})\n${lines.join('\n')}`;
}

// ── /help ────────────────────────────────────────────────────────────────────

function handleHelp() {
  return [
    'Available Commands:',
    '  /status        - Show team member status',
    '  /leads         - Count of unassigned brokerage leads',
    '  /pipeline      - Pipeline summary across all agents',
    '  /assign @lead @realtor - Quick-assign a lead',
    '  /tours-today   - Today\'s tours across the team',
    '  /followups     - Overdue follow-ups across team',
    '  /help          - Show this help message',
    '',
    'Tip: Type / to see command suggestions, @ to mention someone.',
  ].join('\n');
}

// ── Utilities ────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
