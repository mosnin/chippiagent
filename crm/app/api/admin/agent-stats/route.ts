import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';

/** GET /api/admin/agent-stats — aggregated agentic system metrics for platform admins */
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:agent-stats:read:${session.userId}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get('days');
  const days = Math.min(Math.max(1, parseInt(daysParam ?? '30', 10) || 30), 365);

  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    // ── 1. Task counts by status ──────────────────────────────────────────────
    const { data: statusRows, error: statusErr } = await supabase
      .from('AgentTask')
      .select('status')
      .gte('createdAt', since);

    if (statusErr) {
      console.error('[admin/agent-stats] status query failed', statusErr);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const tasksByStatus: Record<string, number> = {};
    let totalTasks = 0;
    let failedCount = 0;

    for (const row of statusRows ?? []) {
      const s = row.status as string;
      tasksByStatus[s] = (tasksByStatus[s] ?? 0) + 1;
      totalTasks++;
      if (s === 'failed') failedCount++;
    }

    // ── 2. Cost aggregates ────────────────────────────────────────────────────
    const { data: costRows, error: costErr } = await supabase
      .from('AgentTask')
      .select('estimatedCostUsd')
      .gte('createdAt', since);

    if (costErr) {
      console.error('[admin/agent-stats] cost query failed', costErr);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    let totalCostUsd = 0;
    const costRowsTyped = (costRows ?? []) as { estimatedCostUsd: string | number | null }[];
    for (const row of costRowsTyped) {
      totalCostUsd += parseFloat(String(row.estimatedCostUsd ?? 0));
    }
    const avgCostUsd = totalTasks > 0 ? totalCostUsd / totalTasks : 0;

    // ── 3. Top tools by call count (via ExecutionStep) ────────────────────────
    // Join through taskId to scope to the time window — ExecutionStep has no
    // standalone createdAt index on tasks, but we can fetch the step rows for
    // tasks in range. For large datasets this is bounded by the 30-day window.
    const { data: stepRows, error: stepErr } = await supabase
      .from('ExecutionStep')
      .select('toolName, AgentTask!inner(createdAt)')
      .gte('AgentTask.createdAt', since);

    if (stepErr) {
      console.error('[admin/agent-stats] step query failed', stepErr);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const toolCounts: Record<string, number> = {};
    for (const row of stepRows ?? []) {
      const name = (row as { toolName: string }).toolName;
      toolCounts[name] = (toolCounts[name] ?? 0) + 1;
    }

    const topTools = Object.entries(toolCounts)
      .map(([name, callCount]) => ({ name, callCount }))
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 10);

    // ── 4. Tasks + cost by space ──────────────────────────────────────────────
    const { data: spaceRows, error: spaceErr } = await supabase
      .from('AgentTask')
      .select('spaceId, estimatedCostUsd')
      .gte('createdAt', since);

    if (spaceErr) {
      console.error('[admin/agent-stats] space query failed', spaceErr);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const spaceMap: Record<string, { count: number; cost: number }> = {};
    for (const row of (spaceRows ?? []) as { spaceId: string; estimatedCostUsd: string | number | null }[]) {
      const entry = spaceMap[row.spaceId] ?? { count: 0, cost: 0 };
      entry.count++;
      entry.cost += parseFloat(String(row.estimatedCostUsd ?? 0));
      spaceMap[row.spaceId] = entry;
    }

    const tasksBySpace = Object.entries(spaceMap)
      .map(([spaceId, { count, cost }]) => ({ spaceId, count, cost }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // ── 5. Error rate ─────────────────────────────────────────────────────────
    const errorRate = totalTasks > 0 ? (failedCount / totalTasks) * 100 : 0;

    return NextResponse.json({
      days,
      totalTasks,
      tasksByStatus,
      avgCostUsd: parseFloat(avgCostUsd.toFixed(6)),
      totalCostUsd: parseFloat(totalCostUsd.toFixed(6)),
      topTools,
      errorRate: parseFloat(errorRate.toFixed(2)),
      tasksBySpace,
    });
  } catch (err) {
    console.error('[admin/agent-stats] unexpected error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
