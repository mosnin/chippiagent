import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/cron/broker-weekly-report
 *
 * Runs every Monday at 9 AM. Compiles a weekly activity report for each
 * active brokerage and emails it to the broker owner.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/broker-weekly-report] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // ── Fetch all active brokerages ──
    const { data: brokerages, error: brokErr } = await supabase
      .from('Brokerage')
      .select('id, name, ownerId, logoUrl')
      .eq('status', 'active');
    if (brokErr) throw brokErr;

    if (!brokerages?.length) {
      return NextResponse.json({ sent: 0, message: 'No active brokerages' });
    }

    let sent = 0;

    for (const brokerage of brokerages) {
      try {
        // Fetch broker owner email
        const { data: ownerUser } = await supabase
          .from('User')
          .select('id, email, name')
          .eq('id', brokerage.ownerId)
          .maybeSingle();
        if (!ownerUser?.email) continue;

        // Fetch all members with their spaces
        const { data: memberships } = await supabase
          .from('BrokerageMembership')
          .select('userId, role')
          .eq('brokerageId', brokerage.id)
          .order('createdAt', { ascending: true });

        const rawMembers = (memberships ?? []) as Array<{ userId: string; role: string }>;
        const memberUserIds = rawMembers.map((m) => m.userId).filter(Boolean);
        let memberSpaces: any[] = [];
        if (memberUserIds.length > 0) {
          const { data } = await supabase.from('Space').select('id, ownerId, slug, name').in('ownerId', memberUserIds);
          memberSpaces = data ?? [];
        }
        const spaceByOwner = new Map(memberSpaces.map((s: any) => [s.ownerId, s]));

        const spaceIds = memberSpaces.map((s: any) => s.id).filter(Boolean) as string[];
        if (spaceIds.length === 0) continue;

        // ── Gather stats for the past 7 days per space ──
        const [newLeadsRes, contactedLeadsRes, newDealsRes, wonDealsRes] = await Promise.all([
          // New leads assigned (contacts created in the past 7 days with assigned-by-broker tag)
          supabase
            .from('Contact')
            .select('id, spaceId')
            .in('spaceId', spaceIds)
            .gte('createdAt', sevenDaysAgo)
            .limit(10000),
          // Leads contacted (contacts with lastContactedAt in the past 7 days)
          supabase
            .from('Contact')
            .select('id, spaceId')
            .in('spaceId', spaceIds)
            .gte('lastContactedAt', sevenDaysAgo)
            .limit(10000),
          // New deals created this week
          supabase
            .from('Deal')
            .select('id, spaceId, value, status')
            .in('spaceId', spaceIds)
            .gte('createdAt', sevenDaysAgo)
            .limit(10000),
          // Deals won (closed) this week
          supabase
            .from('Deal')
            .select('id, spaceId, value')
            .in('spaceId', spaceIds)
            .eq('status', 'won')
            .gte('updatedAt', sevenDaysAgo)
            .limit(10000),
        ]);

        const newLeads = newLeadsRes.data ?? [];
        const contactedLeads = contactedLeadsRes.data ?? [];
        const newDeals = newDealsRes.data ?? [];
        const wonDeals = wonDealsRes.data ?? [];

        // Build per-space counts
        function countBySpace(rows: { spaceId: string }[]): Record<string, number> {
          return rows.reduce<Record<string, number>>((acc, r) => {
            acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
            return acc;
          }, {});
        }
        function sumBySpace(rows: { spaceId: string; value?: number | null }[]): Record<string, number> {
          return rows.reduce<Record<string, number>>((acc, r) => {
            acc[r.spaceId] = (acc[r.spaceId] ?? 0) + (r.value ?? 0);
            return acc;
          }, {});
        }

        const newLeadsBySpace = countBySpace(newLeads as { spaceId: string }[]);
        const contactedBySpace = countBySpace(contactedLeads as { spaceId: string }[]);
        const newDealsBySpace = countBySpace(newDeals as { spaceId: string }[]);
        const wonDealsBySpace = countBySpace(wonDeals as { spaceId: string }[]);
        const wonValueBySpace = sumBySpace(wonDeals as { spaceId: string; value?: number | null }[]);

        // Build per-agent rows
        type AgentRow = {
          name: string;
          email: string;
          role: string;
          newLeads: number;
          contacted: number;
          dealsCreated: number;
          dealsClosed: number;
          closedValue: number;
        };

        const agentRows: AgentRow[] = [];
        let totalNewLeads = 0;
        let totalContacted = 0;
        let totalDealsCreated = 0;
        let totalDealsClosed = 0;
        let totalClosedValue = 0;

        // Batch-fetch user names for the report
        let memberUsers: any[] = [];
        if (memberUserIds.length > 0) {
          const { data } = await supabase.from('User').select('id, name, email').in('id', memberUserIds);
          memberUsers = data ?? [];
        }
        const userByIdMap = new Map(memberUsers.map((u: any) => [u.id, u]));

        for (const m of rawMembers) {
          const space = spaceByOwner.get(m.userId);
          const sid = space?.id;
          if (!sid) continue;
          const user = userByIdMap.get(m.userId);

          const row: AgentRow = {
            name: user?.name ?? user?.email ?? 'Unknown',
            email: user?.email ?? '',
            role: m.role === 'broker_owner' ? 'Owner' : m.role === 'broker_admin' ? 'Admin' : 'Realtor',
            newLeads: newLeadsBySpace[sid] ?? 0,
            contacted: contactedBySpace[sid] ?? 0,
            dealsCreated: newDealsBySpace[sid] ?? 0,
            dealsClosed: wonDealsBySpace[sid] ?? 0,
            closedValue: wonValueBySpace[sid] ?? 0,
          };

          agentRows.push(row);
          totalNewLeads += row.newLeads;
          totalContacted += row.contacted;
          totalDealsCreated += row.dealsCreated;
          totalDealsClosed += row.dealsClosed;
          totalClosedValue += row.closedValue;
        }

        // Find top performer (by deals closed, then by contacted)
        const topPerformer = [...agentRows].sort((a, b) => {
          if (b.dealsClosed !== a.dealsClosed) return b.dealsClosed - a.dealsClosed;
          return b.contacted - a.contacted;
        })[0];

        // ── Send email ──
        if (process.env.RESEND_API_KEY) {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          const rawFrom = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
          const FROM = rawFrom.includes('@') ? rawFrom : `notifications@${rawFrom}`;
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';

          const html = buildWeeklyReportHtml({
            brokerageName: brokerage.name,
            agentRows,
            totalNewLeads,
            totalContacted,
            totalDealsCreated,
            totalDealsClosed,
            totalClosedValue,
            topPerformerName: topPerformer?.name ?? 'N/A',
            dashboardUrl: `${appUrl}/broker`,
          });

          const safeName = brokerage.name.replace(/[\r\n\t]/g, ' ').slice(0, 100);
          await resend.emails.send({
            from: FROM,
            to: ownerUser.email,
            subject: `Weekly Report — ${safeName} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
            html,
          });

          sent++;
        }
      } catch (err) {
        console.error('[cron/broker-weekly-report] Failed for brokerage', {
          brokerageId: brokerage.id,
          error: err,
        });
      }
    }

    return NextResponse.json({ sent });
  } catch (error) {
    console.error('[cron/broker-weekly-report] Unhandled error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

type AgentRow = {
  name: string;
  email: string;
  role: string;
  newLeads: number;
  contacted: number;
  dealsCreated: number;
  dealsClosed: number;
  closedValue: number;
};

function buildWeeklyReportHtml(params: {
  brokerageName: string;
  agentRows: AgentRow[];
  totalNewLeads: number;
  totalContacted: number;
  totalDealsCreated: number;
  totalDealsClosed: number;
  totalClosedValue: number;
  topPerformerName: string;
  dashboardUrl: string;
}): string {
  const {
    brokerageName,
    agentRows,
    totalNewLeads,
    totalContacted,
    totalDealsCreated,
    totalDealsClosed,
    totalClosedValue,
    topPerformerName,
    dashboardUrl,
  } = params;

  const agentRowsHtml = agentRows
    .map(
      (a) => `
      <tr>
        <td style="padding:10px 12px;font-size:13px;color:#111827;font-weight:500;border-bottom:1px solid #f1f5f9">${esc(a.name)}</td>
        <td style="padding:10px 8px;font-size:13px;color:#374151;text-align:center;border-bottom:1px solid #f1f5f9">${a.newLeads}</td>
        <td style="padding:10px 8px;font-size:13px;color:#374151;text-align:center;border-bottom:1px solid #f1f5f9">${a.contacted}</td>
        <td style="padding:10px 8px;font-size:13px;color:#374151;text-align:center;border-bottom:1px solid #f1f5f9">${a.dealsCreated}</td>
        <td style="padding:10px 8px;font-size:13px;color:#059669;font-weight:600;text-align:center;border-bottom:1px solid #f1f5f9">${a.dealsClosed}</td>
        <td style="padding:10px 8px;font-size:13px;color:#059669;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(a.closedValue)}</td>
      </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <!-- Header -->
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">${esc(brokerageName)}</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">Weekly Activity Report</p>
        </td></tr>

        <!-- Summary cards -->
        <tr><td style="padding:24px 28px 0">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:12px;text-align:center;background:#f0fdf4;border-radius:8px;width:25%">
                <p style="margin:0;font-size:24px;font-weight:700;color:#059669">${totalDealsClosed}</p>
                <p style="margin:2px 0 0;font-size:11px;color:#6b7280;font-weight:500">Deals Closed</p>
              </td>
              <td style="width:8px"></td>
              <td style="padding:12px;text-align:center;background:#eff6ff;border-radius:8px;width:25%">
                <p style="margin:0;font-size:24px;font-weight:700;color:#2563eb">${totalNewLeads}</p>
                <p style="margin:2px 0 0;font-size:11px;color:#6b7280;font-weight:500">New People</p>
              </td>
              <td style="width:8px"></td>
              <td style="padding:12px;text-align:center;background:#fefce8;border-radius:8px;width:25%">
                <p style="margin:0;font-size:24px;font-weight:700;color:#ca8a04">${totalContacted}</p>
                <p style="margin:2px 0 0;font-size:11px;color:#6b7280;font-weight:500">Contacted</p>
              </td>
              <td style="width:8px"></td>
              <td style="padding:12px;text-align:center;background:#f0fdf4;border-radius:8px;width:25%">
                <p style="margin:0;font-size:24px;font-weight:700;color:#059669">${fmt(totalClosedValue)}</p>
                <p style="margin:2px 0 0;font-size:11px;color:#6b7280;font-weight:500">Closed Value</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Top performer -->
        <tr><td style="padding:16px 28px 0">
          <p style="margin:0;font-size:13px;color:#374151">
            <span style="font-size:14px;margin-right:4px">&#11088;</span>
            <strong>Top performer this week:</strong> ${esc(topPerformerName)}
          </p>
        </td></tr>

        <!-- Agent table -->
        <tr><td style="padding:20px 28px">
          <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">Per-Agent Breakdown</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #e5e7eb">Agent</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #e5e7eb">People</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #e5e7eb">Contacted</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #e5e7eb">New Deals</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #e5e7eb">Closed</th>
                <th style="padding:10px 8px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #e5e7eb">Value</th>
              </tr>
            </thead>
            <tbody>
              ${agentRowsHtml}
              <!-- Totals row -->
              <tr style="background:#f8fafc">
                <td style="padding:10px 12px;font-size:13px;color:#111827;font-weight:700">Team Total</td>
                <td style="padding:10px 8px;font-size:13px;color:#111827;font-weight:700;text-align:center">${totalNewLeads}</td>
                <td style="padding:10px 8px;font-size:13px;color:#111827;font-weight:700;text-align:center">${totalContacted}</td>
                <td style="padding:10px 8px;font-size:13px;color:#111827;font-weight:700;text-align:center">${totalDealsCreated}</td>
                <td style="padding:10px 8px;font-size:13px;color:#111827;font-weight:700;text-align:center">${totalDealsClosed}</td>
                <td style="padding:10px 8px;font-size:13px;color:#111827;font-weight:700;text-align:right">${fmt(totalClosedValue)}</td>
              </tr>
            </tbody>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 28px 24px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${dashboardUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px">View Dashboard &rarr;</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">
            This weekly report is automatically generated for <strong>${esc(brokerageName)}</strong>. Manage your notification preferences in broker settings.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
