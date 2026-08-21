/**
 * POST /api/chippi/post-tour/execute
 *
 * Body: { proposals: { tool: string, args: Record<string, unknown> }[] }
 * Returns: { results: { tool, ok, summary, error? }[] }
 *
 * Runs each approved proposal serially through `executeTool` — the same
 * pipeline the chat agent uses, which means rate limits, zod validation,
 * and per-tool side effects all behave identically. Serial on purpose:
 * a misbehaving model can't fan out a wave of writes, and a partial
 * failure surfaces the exact tool that broke.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';
import { executeTool } from '@/lib/ai-tools/execute';
import { doneVerbForToolkit, sanitizeExecuteProposals } from '@/lib/chippi/post-tour';
import { activeToolkits } from '@/lib/integrations/connections';
import { composioConfigured, executeToolForEntity } from '@/lib/integrations/composio';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ExecuteBody {
  proposals?: unknown;
}

interface ProposalIn {
  tool: string;
  args: Record<string, unknown>;
  /** Toolkit slug if this came from a connected app (gmail, googlecalendar, ...). */
  integrationToolkit?: string;
}

interface ResultOut {
  tool: string;
  ok: boolean;
  summary: string;
  error?: string;
  /** Realtor-voice verb for the post-execute toast. Only set on success. */
  doneVerb?: string;
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await checkRateLimit(`chippi:post-tour-exec:${userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: ExecuteBody;
  try {
    body = (await req.json()) as ExecuteBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.proposals) || body.proposals.length === 0) {
    return NextResponse.json({ error: 'No proposals' }, { status: 400 });
  }
  if (body.proposals.length > 10) {
    return NextResponse.json({ error: 'Too many proposals' }, { status: 413 });
  }

  // Sanitize the input. Native tools must be on the post-tour allowlist;
  // connected-app slugs are resolved from the tool name against the
  // realtor's live toolkits. The recorder sends `{ tool, args }` only —
  // requiring a client-echoed `integrationToolkit` dropped approved
  // follow-up sends. A revoke between propose and execute still drops
  // the slug. This route is not a generic tool runner.
  const connectedToolkits = composioConfigured()
    ? new Set(await activeToolkits({ spaceId: space.id, userId }))
    : new Set<string>();

  const proposals: ProposalIn[] = sanitizeExecuteProposals(body.proposals, connectedToolkits);
  if (proposals.length === 0) {
    return NextResponse.json({ error: 'No valid proposals' }, { status: 400 });
  }

  const ctx = {
    userId,
    space: {
      id: space.id,
      slug: space.slug,
      name: space.name,
      ownerId: space.ownerId,
    },
    signal: AbortSignal.timeout(50_000),
  };

  const results: ResultOut[] = [];
  for (const p of proposals) {
    try {
      // Branch (a): the SDK already knows how to fire its own tools.
      // Native path stays on the imperative executor; integration path
      // calls Composio directly. Two surfaces, no shared adapter.
      if (p.integrationToolkit) {
        const resp = await executeToolForEntity({
          entityId: userId,
          slug: p.tool,
          arguments: p.args,
        });
        if (resp.successful) {
          const verb = doneVerbForToolkit(p.integrationToolkit) ?? 'done';
          results.push({
            tool: p.tool,
            ok: true,
            summary: verb,
            doneVerb: verb,
          });
        } else {
          results.push({
            tool: p.tool,
            ok: false,
            summary: resp.error ?? 'Failed',
            error: 'integration_error',
          });
        }
      } else {
        const exec = await executeTool(p.tool, p.args, ctx);
        if (exec.ok && exec.result) {
          results.push({ tool: p.tool, ok: true, summary: exec.result.summary });
        } else {
          results.push({
            tool: p.tool,
            ok: false,
            summary: exec.error?.message ?? 'Failed',
            error: exec.error?.code,
          });
        }
      }
    } catch (err) {
      logger.error('[chippi/post-tour/execute] tool threw', { tool: p.tool }, err);
      results.push({
        tool: p.tool,
        ok: false,
        summary: 'Unexpected error',
        error: 'handler_error',
      });
    }
  }

  return NextResponse.json({ results });
}
