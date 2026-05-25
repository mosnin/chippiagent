/**
 * Suggested follow-up actions — the 2-4 chip row that appears after an
 * assistant turn. Curated by the last tool name in the turn. Static for
 * v1; an LLM-driven follow-up generator can replace this later without
 * touching the render layer.
 *
 * Design intent (Jobs): the chips remove a typing step for the realtor's
 * next move. Each chip is the ENTIRE next prompt — clicking it fires the
 * exact text as the user's next message. So the labels are written as
 * the realtor would say them, not as commands.
 */

import type { MessageBlock, ToolCallBlock } from './blocks';

/** Map last-tool-in-turn → curated follow-up prompts. */
const SUGGESTIONS_BY_TOOL: Record<string, string[]> = {
  search_contacts: ['Draft a follow-up email', 'Schedule a tour', 'Show their deals'],
  get_contact: ['Draft an email', 'Schedule a call', 'Add a note'],
  find_person: ['Draft a follow-up', 'Add to pipeline', 'Schedule a tour'],
  search_deals: ['Show stuck deals', 'Find overdue follow-ups', "What's closing this week?"],
  pipeline_summary: ['Show stuck deals', 'Find overdue follow-ups', 'Show hot leads'],
  find_stuck_deals: ['Draft re-engagement emails', "What's closing this week?", 'Show hot leads'],
  find_overdue_followups: ['Draft reminders for these', 'Snooze for tomorrow', 'Show pipeline'],
  find_quiet_hot_persons: ['Draft re-engagement emails', 'Schedule check-in calls', 'Show pipeline'],
  search_properties: ['Schedule a tour here', 'Find similar properties', 'Save this property'],
  find_property: ['Schedule a tour here', 'Find similar properties', 'Show recent comparables'],
  add_property: ['Schedule a tour', 'Match to interested buyers', 'Add another property'],
  schedule_tour: ['Send a confirmation', 'Add follow-up reminder', 'Block prep time'],
  reschedule_tour: ['Send the update', 'Add a follow-up note', 'Show this week'],
  check_availability: ['Schedule a tour', 'Send these times to the lead', 'Block focus time'],
  find_tours: ['Send a reminder', 'Add follow-up after tour', "Show today's calendar"],
  send_email: ['Log to deal notes', 'Schedule a follow-up', 'Draft another'],
  draft_email: ['Send it', 'Adjust the tone', 'Save as template'],
  send_sms: ['Log to deal notes', 'Set a follow-up reminder', 'Draft another'],
  draft_sms: ['Send it', 'Shorten it', 'Try a different tone'],
  recall_history: ['Summarize what we know', 'Draft the next message', 'Show deal status'],
  create_plan: ["Start with step 1", 'Adjust the plan', 'Cancel'],
  planner: ["Start with step 1", 'Adjust the plan', 'Cancel'],
  analyze_pipeline: ['Show stuck deals', 'Show overdue follow-ups', 'Show hot leads'],
  research_person: ['Draft a personalized email', 'Schedule a check-in', 'Add to top priorities'],
};

/** Shown when no tools fired (pure-chat turn) or on conversation start. */
const DEFAULT_SUGGESTIONS = [
  "Show today's pipeline",
  'Find hot leads',
  'Plan my day',
];

/**
 * Pick suggestions for the latest assistant turn. Reads the last tool call
 * by position and returns its curated set. Returns an empty array when the
 * turn shouldn't show any (e.g. errored). Capped to 4 chips — Jobs lens:
 * configuration is failure to decide.
 */
export function getSuggestionsForTurn(blocks: MessageBlock[] | null | undefined): string[] {
  if (!blocks || blocks.length === 0) return DEFAULT_SUGGESTIONS;
  // Walk backwards for the last *completed* tool call. Errors / denials don't
  // produce a useful next-action context — fall back to the default set.
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type !== 'tool_call') continue;
    const tc = b as ToolCallBlock;
    if (tc.status !== 'complete') continue;
    const set = SUGGESTIONS_BY_TOOL[tc.name];
    if (set) return set.slice(0, 4);
    return DEFAULT_SUGGESTIONS;
  }
  return DEFAULT_SUGGESTIONS;
}
