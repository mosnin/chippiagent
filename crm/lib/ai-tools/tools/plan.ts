/**
 * `create_plan` — display tool for the planner sub-agent.
 *
 * This is a pure display tool: it accepts a structured execution plan from
 * the planner agent and emits it to the UI as JSON. There is no side effect,
 * no mutation, no network call. Its only job is to surface the plan so the
 * frontend can render it as a step-by-step card before the main agent starts
 * executing.
 *
 * The handler returns the steps array as a JSON string so the frontend can
 * parse and render each step without relying on the model's prose output.
 *
 * Read-only. No auth requirement — it accesses no external data.
 */

import { z } from 'zod';
import { defineTool } from '../types';

const stepSchema = z.object({
  title: z.string().min(1).max(60).describe('Short title for this step (≤6 words).'),
  description: z.string().min(1).max(300).describe('One sentence: what will happen in this step.'),
});

const parameters = z.object({
  task: z.string().min(1).max(500).describe('The full user task being planned.'),
  steps: z
    .array(stepSchema)
    .min(2)
    .max(7)
    .describe('Ordered list of 2–7 concrete steps to execute the task.'),
});

interface PlanStep {
  title: string;
  description: string;
}

interface PlanResult {
  task: string;
  steps: PlanStep[];
}

export const createPlanTool = defineTool<typeof parameters, PlanResult>({
  name: 'create_plan',
  riskLevel: 'safe',
  description:
    'Emit a structured multi-step execution plan for a complex task. Call this once with the full task and an ordered list of 2–7 concrete steps.',
  parameters,
  requiresApproval: false,

  async handler(args) {
    const plan: PlanResult = {
      task: args.task,
      steps: args.steps,
    };

    return {
      summary: `Plan created with ${args.steps.length} steps for: ${args.task}`,
      data: plan,
      display: 'plain',
    };
  },
});
