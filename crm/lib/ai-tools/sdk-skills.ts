/**
 * Specialist sub-agent factories. Delegates to the SKILL.md loader.
 *
 * Before commit 8d51b97: each specialist's `name`, `instructions`, and
 * tool list lived as hand-coded TS strings here. New skills meant a new
 * exported function and inline copy that wasn't editable by non-engineers.
 *
 * After: each specialist is a `lib/ai-tools/skills/<slug>/SKILL.md` with
 * Anthropic Agent Skills-style frontmatter. The exported functions below
 * are the unchanged public surface that `sdk-chat.ts` (and tests) call.
 * Internally they ask the loader to build the Agent from the SKILL.md.
 *
 * Why preserve these wrappers instead of having `sdk-chat.ts` call
 * `buildSkillAgent('pipeline-analyst', ...)` directly: backwards-compat
 * keeps the diff small. If a future commit ever inlines them, the loader
 * is the source of truth either way.
 */

import type { Agent } from '@openai/agents';
import { buildSkillAgent } from './skills/loader';
import type { ToolContext } from './types';

/** Pipeline analyst — surveys the deal pipeline and reports stuck deals,
 *  quiet hot persons, and overdue follow-ups in one paragraph. */
export function buildPipelineAnalystAgent(
  ctx: ToolContext,
  opts: { model?: string } = {},
): Agent {
  return buildSkillAgent('pipeline-analyst', ctx, opts);
}

/** Contact researcher — digs up everything we know about one person and
 *  recommends the next reasonable action. */
export function buildContactResearcherAgent(
  ctx: ToolContext,
  opts: { model?: string } = {},
): Agent {
  return buildSkillAgent('contact-researcher', ctx, opts);
}

/** Planner — decomposes a complex user task into a 3-7 step execution
 *  plan and surfaces it via `create_plan` before any domain tools run. */
export function buildPlannerAgent(
  ctx: ToolContext,
  opts: { model?: string } = {},
): Agent {
  return buildSkillAgent('planner', ctx, opts);
}
