'use client';

/**
 * SubagentBlockView — single-line "Completed Subagent · <task> · <elapsed>"
 * row for a subagent tool call. Subagents are conceptually distinct from
 * regular tools (they spawn their own model call + tool chain), so they get
 * their own visual treatment instead of being lumped into ToolGroup.
 *
 * Renders using the shared ToolGroup primitive with `nestedTools=[]` so the
 * chevron disappears and the row becomes a non-interactive status line.
 *
 * Shape:
 *   Running:    "Running Subagent    Collect previews"        (shimmer)
 *   Completed:  "Completed Subagent  Collect previews    6s"
 *   Failed:     "Subagent failed     Collect previews"
 *
 * Elapsed time stays hidden until ToolCallBlock grows startedAt/endedAt —
 * fabricated numbers are worse than no number.
 */

import { ToolGroup } from '@/components/ui/tool-group';
import type { ToolCallBlock } from '@/lib/ai-tools/blocks';

/** Subagent tool names — kept in sync with `asTool()` registrations in
 *  `lib/ai-tools/sdk-chat.ts`. Update both when adding a new subagent. */
const SUBAGENT_TOOL_NAMES = new Set<string>([
  'analyze_pipeline',
  'research_person',
  'planner',
]);

export function isSubagentTool(name: string): boolean {
  return SUBAGENT_TOOL_NAMES.has(name);
}

function getTaskDescription(
  args: Record<string, unknown> | undefined | null,
): string | undefined {
  if (!args) return undefined;
  const v = args.input ?? args.task ?? args.description ?? args.query;
  if (typeof v !== 'string') return undefined;
  return v.length > 80 ? `${v.slice(0, 77)}…` : v;
}

export interface SubagentBlockViewProps {
  block: ToolCallBlock;
  live?: boolean;
}

export function SubagentBlockView({ block, live }: SubagentBlockViewProps) {
  const status: 'running' | ToolCallBlock['status'] = live ? 'running' : block.status;
  const task = getTaskDescription(block.args);

  const isRunning = status === 'running';
  const isError = status === 'error';

  const state = isRunning ? 'pending' : isError ? 'interrupted' : 'completed';

  // Labels chosen so the screen-glance reads as "<verb> Subagent · <task>"
  // — the task fills the description slot the ToolGroup primitive exposes.
  const completeLabel = isError ? 'Subagent failed' : 'Completed Subagent';
  const shimmerLabel = 'Running Subagent';
  const interruptedLabel = isError && task ? `Subagent failed · ${task}` : 'Subagent failed';

  return (
    <ToolGroup
      state={state}
      // Empty nestedTools → no chevron, no expand-toggle. The row becomes
      // a status line instead of an interactive disclosure.
      nestedTools={[]}
      description={task}
      completeLabel={completeLabel}
      shimmerLabel={shimmerLabel}
      interruptedLabel={interruptedLabel}
      showElapsed={false}
    />
  );
}
