/**
 * Central registry of tools available to the on-demand agent loop.
 *
 * Post-cutover the only remaining surface that uses this registry is the
 * post-tour proposal-execute path (`app/api/chippi/post-tour/execute/route.ts`)
 * — it looks up tools by name and runs them imperatively without a model
 * in the loop. The chat itself goes through the SDK's own registry built
 * inside `lib/ai-tools/sdk-chat.ts`.
 *
 * Keeping the explicit Map (rather than dynamic file-system scanning)
 * means the full catalog is obvious at a glance.
 */

import { ALL_TOOLS } from './tools';
import type { ToolDefinition } from './types';

const REGISTRY: Map<string, ToolDefinition<unknown, unknown>> = new Map(
  ALL_TOOLS.map((t) => [t.name, t as ToolDefinition<unknown, unknown>]),
);

// Guardrail: duplicate names would silently lose a tool on Map insertion.
if (REGISTRY.size !== ALL_TOOLS.length) {
  const seen = new Set<string>();
  for (const t of ALL_TOOLS) {
    if (seen.has(t.name)) {
      throw new Error(`Duplicate tool name in registry: ${t.name}`);
    }
    seen.add(t.name);
  }
}

/** Look up a tool by name. Returns `undefined` for unknown names. */
export function getTool(name: string): ToolDefinition<unknown, unknown> | undefined {
  return REGISTRY.get(name);
}

/** Full list of tools. */
export function listTools(): ToolDefinition<unknown, unknown>[] {
  return Array.from(REGISTRY.values());
}

/** Does this tool need the user's approval before running? */
export function toolRequiresApproval<TArgs>(
  tool: ToolDefinition<TArgs>,
  args: TArgs,
  ctx: Parameters<ToolDefinition<TArgs>['handler']>[1],
): boolean {
  if (tool.requiresApproval === true) return true;
  if (tool.requiresApproval === false) return false;
  return tool.shouldApprove ? tool.shouldApprove(args, ctx) : true;
}
