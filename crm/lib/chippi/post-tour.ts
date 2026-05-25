/**
 * Post-tour orchestration helpers.
 *
 * Given a transcript like "Sam loved it, wants to make an offer at 1.1M,
 * follow up Friday, his wife was worried about the school district", we
 * ask the model to propose 2-5 actions the realtor would have taken
 * manually. The model does NOT execute the tools — it returns intent
 * only. The realtor approves the batch in one tap; the route then runs
 * each tool serially via the existing `executeTool` pipeline.
 *
 * Why option (b) (JSON inference) over (a) (SDK interrupt loop):
 *  - The agent SDK approve-flow only pauses on `requiresApproval: true`.
 *    Read-only tools like `find_person` and `draft_email` would just run
 *    against the live workspace, which is the wrong contract for a
 *    realtor who wants to review before anything happens.
 *  - One round trip vs. many. Faster, cheaper, easier to reason about.
 *  - The output is trivially capped, sorted, and de-duplicated server-side.
 *
 * If the model returns 0 actions or invalid JSON, the route surfaces a
 * calm empty state. If the model goes wild and returns 10 actions, we
 * truncate to 5. Either failure mode is the model's fault; the realtor
 * sees a clean surface either way.
 */

import { z } from 'zod';
import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolDefinition } from '@/lib/ai-tools/types';
import { getTool } from '@/lib/ai-tools/registry';

/** Cap on actions returned to the UI. The stack must fit on one screen. */
export const MAX_PROPOSALS = 5;

/** Subset of tools the orchestrator is allowed to propose post-tour. The
 *  full 42-tool registry is too noisy for a 30-second debrief — most of
 *  these are administrative or aggregate queries the realtor would never
 *  trigger from a tour recap. The seven below cover the actual moments:
 *  log it, mark it, schedule the next thing, draft the message. */
export const POST_TOUR_TOOL_ALLOWLIST = [
  'log_call',
  'log_meeting',
  'note_on_person',
  'note_on_deal',
  'mark_person_hot',
  'mark_person_cold',
  'set_followup',
  'draft_email',
  'draft_sms',
] as const;

export type PostTourToolName = (typeof POST_TOUR_TOOL_ALLOWLIST)[number];

/**
 * A Composio tool the realtor's connected accounts expose. We pull this
 * straight from `loadToolsForEntity` and re-shape into the minimal pair
 * (slug, description, toolkit) the orchestrator needs to know about.
 *
 * The `toolkit` is the parent app slug ("gmail", "googlecalendar") — used
 * for the done-verb resolver, NOT shown to the realtor in the proposal
 * stack. The verb does the talking; no "via Gmail" badges.
 */
export interface IntegrationToolSpec {
  /** Composio tool slug — e.g. "GMAIL_SEND_EMAIL". The proposal model emits this verbatim. */
  slug: string;
  /** Realtor-readable description. May be Composio's text, may be pre-processed. */
  description: string;
  /** Parent toolkit slug — "gmail", "googlecalendar". Used for verb resolution only. */
  toolkit: string;
}

/** What the model is asked to return. */
const ProposalSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
});

const OrchestratorOutputSchema = z.object({
  proposals: z.array(ProposalSchema).default([]),
});

export interface ProposedAction {
  /** Native tool name OR Composio tool slug. The execute route branches on this. */
  tool: PostTourToolName | string;
  args: Record<string, unknown>;
  /** Human-readable line — the row label in the approval stack. */
  summary: string;
  /** Chippi-voice line that uses the resolved Contact/Deal name instead of
   *  an ID slug. Set server-side after a batched lookup. The UI prefers
   *  this over `summary` whenever it's present. Absent only on the rare
   *  miss (id outside the workspace, or model returned no id). */
  humanSummary?: string;
  /** Whether this verb mutates state (i.e. needs the realtor's yes). */
  mutates: boolean;
  /**
   * Toolkit slug ("gmail", "googlecalendar") for proposals that came from
   * a connected app. Absent for native tools. The execute route uses this
   * to route Composio calls and to build the done-sentence verb.
   */
  integrationToolkit?: string;
}

export interface ContextHint {
  personId?: string;
  dealId?: string;
}

/** System prompt fed to the orchestrator. Tight contract, no manifesto.
 *
 *  When the realtor has connected apps (Gmail, Google Calendar, ...),
 *  their Composio tools are appended as a second catalog block. The
 *  proposal model picks between native (`draft_email`) and connected
 *  (`GMAIL_SEND_EMAIL`) on intent — drafting vs. actually sending. */
export function buildSystemPrompt(
  allowedTools: readonly ToolDefinition[],
  integrationTools: readonly IntegrationToolSpec[] = [],
): string {
  const native = allowedTools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');

  const lines: string[] = [
    'Turn a realtor\'s post-tour debrief into 2-5 proposed actions. Return intent only — never execute.',
    '',
    'Allowed tools:',
    native,
  ];

  if (integrationTools.length > 0) {
    const integ = integrationTools
      .map((t) => `- ${t.slug}: ${t.description}`)
      .join('\n');
    lines.push(
      '',
      'Connected-app tools (the realtor has authorized these):',
      integ,
      '',
      'When the realtor\'s intent is to actually send, schedule, or post — not draft — prefer the connected-app tool.',
      'Examples: "send Sam a follow-up" → GMAIL_SEND_EMAIL (if Gmail connected). "put the tour on my calendar" → GOOGLECALENDAR_CREATE_EVENT.',
      'If the realtor only wants to see what they\'d say (a draft), use the draft_* tools instead.',
    );
  }

  lines.push(
    '',
    'Rules:',
    '- Use a personId/dealId only when the user payload contains one. If not, drop the action.',
    '- Use ISO 8601 for set_followup.when. Concrete weekday phrases ("friday", "next tuesday") are also accepted.',
    '- Skip any action the transcript doesn\'t justify.',
    '',
    'Output JSON: { "proposals": [ { "tool": "<name>", "args": { ... } } ] }',
  );

  return lines.join('\n');
}

/** Given the model's raw output, produce sanitized ProposedActions. The
 *  function is intentionally pure — it does no DB reads — so unit tests
 *  cover the whole shaping layer without mocking.
 *
 *  Integration tool slugs (passed via opts.integrationTools) are kept
 *  alongside the native allowlist. Native tools are validated against
 *  the in-process registry; integration tools come from the realtor's
 *  connected apps and are trusted as-is — there's no zod schema for them
 *  on this side, the model picks args based on Composio's description. */
export function shapeProposals(
  raw: unknown,
  opts: {
    allowlist?: readonly string[];
    integrationTools?: readonly IntegrationToolSpec[];
  } = {},
): ProposedAction[] {
  const nativeAllow = new Set(opts.allowlist ?? POST_TOUR_TOOL_ALLOWLIST);
  const integByName = new Map(
    (opts.integrationTools ?? []).map((t) => [t.slug, t]),
  );
  const parsed = OrchestratorOutputSchema.safeParse(raw);
  if (!parsed.success) return [];

  const out: ProposedAction[] = [];
  const seen = new Set<string>();

  for (const item of parsed.data.proposals) {
    // De-dupe identical (tool, args) pairs — the model occasionally
    // proposes the same action twice when the transcript mentions
    // something twice.
    const key = `${item.tool}::${stableStringify(item.args)}`;
    if (seen.has(key)) continue;

    if (nativeAllow.has(item.tool)) {
      const def = getTool(item.tool);
      if (!def) continue;
      seen.add(key);

      let summary: string;
      try {
        summary = def.summariseCall
          ? (def.summariseCall as (a: unknown) => string)(item.args)
          : `Run ${item.tool}`;
      } catch {
        summary = `Run ${item.tool}`;
      }

      out.push({
        tool: item.tool as PostTourToolName,
        args: item.args,
        summary,
        mutates: def.requiresApproval !== false,
      });
    } else if (integByName.has(item.tool)) {
      const integ = integByName.get(item.tool)!;
      seen.add(key);
      out.push({
        tool: item.tool,
        args: item.args,
        summary: integrationProposalSummary(integ.toolkit, item.args),
        mutates: true,
        integrationToolkit: integ.toolkit,
      });
    } else {
      continue;
    }

    if (out.length >= MAX_PROPOSALS) break;
  }

  return out;
}

/** Realtor-voice summary for an integration proposal. The toolkit slug
 *  carries the verb; we never show "via Gmail" — the verb tells the truth.
 *  Used as a fallback when there's no resolved person name to humanize. */
function integrationProposalSummary(
  toolkit: string,
  args: Record<string, unknown>,
): string {
  const verb = realtorVerbForToolkit(toolkit);
  // Try a few common arg keys for a recipient hint, but don't hard-fail.
  const recipient = pickFirstString(args, ['to', 'recipient', 'recipient_email', 'attendees', 'email']);
  return recipient ? `${verb} to ${recipient}` : verb;
}

function pickFirstString(args: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = args[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  }
  return null;
}

/** JSON.stringify with sorted keys — needed for de-dup to work across
 *  different model output orders. Tiny, correct for our shapes. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Run the orchestrator. Returns the shaped proposals.
 *  - Throws on transport / API failure (route maps to 500).
 *  - Returns [] for empty / malformed model output.
 *  Caller is responsible for the auth and rate-limit gates. */
export async function proposeActions(
  openai: OpenAI,
  input: {
    transcript: string;
    contextHint?: ContextHint;
    tools: ToolDefinition[];
    integrationTools?: IntegrationToolSpec[];
    model?: string;
  },
): Promise<ProposedAction[]> {
  const transcript = input.transcript.trim();
  if (!transcript) return [];

  const allowed = input.tools.filter((t) =>
    (POST_TOUR_TOOL_ALLOWLIST as readonly string[]).includes(t.name),
  );
  const integrationTools = input.integrationTools ?? [];

  const userPayload: Record<string, unknown> = { transcript };
  if (input.contextHint?.personId) userPayload.personId = input.contextHint.personId;
  if (input.contextHint?.dealId) userPayload.dealId = input.contextHint.dealId;

  const completion = await openai.chat.completions.create({
    model: input.model ?? 'gpt-4.1-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(allowed, integrationTools) },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? '';
  if (!text) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  return shapeProposals(raw, { integrationTools });
}

// ── Integration tool loading ──────────────────────────────────────────────

/**
 * Resolve the Composio tools the realtor's post-tour orchestrator should
 * see. Mirrors `loadIntegrationTools` from `sdk-chat.ts` — fresh per
 * request, no cache. Failure modes (Composio unconfigured, unreachable,
 * any throw) degrade gracefully to `[]`: the orchestrator runs on its
 * native catalog and the realtor never sees the seam.
 *
 * The shape returned (`IntegrationToolSpec[]`) is the bridge between the
 * SDK Agent tool surface (`{ name, description, parameters, invoke }`)
 * and our JSON-inference orchestrator. The orchestrator only needs name
 * + description; the execute path re-fetches the slug to actually fire it.
 */
export async function loadPostTourIntegrationTools(args: {
  spaceId: string;
  userId: string;
}): Promise<IntegrationToolSpec[]> {
  // Lazy imports so this module stays usable in pure unit tests that
  // don't mock the integrations layer.
  const { composioConfigured, loadToolsForEntity } = await import(
    '@/lib/integrations/composio'
  );
  const { activeToolkits } = await import('@/lib/integrations/connections');
  const { logger } = await import('@/lib/logger');

  if (!composioConfigured()) return [];
  try {
    const toolkits = await activeToolkits({ spaceId: args.spaceId, userId: args.userId });
    if (toolkits.length === 0) return [];
    const sdkTools = await loadToolsForEntity({ entityId: args.userId, toolkits });
    return reshapeSdkToolsForOrchestrator(sdkTools, toolkits);
  } catch (err) {
    logger.warn(
      '[post-tour] integration tools load failed — proceeding without them',
      { spaceId: args.spaceId, userId: args.userId, err: err instanceof Error ? err.message : String(err) },
    );
    return [];
  }
}

/**
 * Take Composio's SDK Agent tools and normalize into IntegrationToolSpec.
 * The slug naming convention is `<TOOLKIT>_<ACTION>` (uppercase). We split
 * once on `_` to recover the toolkit, then cross-check against the list
 * we asked for so a Composio rename doesn't poison the verb resolver.
 */
function reshapeSdkToolsForOrchestrator(
  sdkTools: ReadonlyArray<{ name?: unknown; description?: unknown }>,
  authorizedToolkits: readonly string[],
): IntegrationToolSpec[] {
  const known = new Set(authorizedToolkits);
  const out: IntegrationToolSpec[] = [];
  for (const t of sdkTools) {
    if (typeof t.name !== 'string' || !t.name) continue;
    const description = typeof t.description === 'string' ? t.description : '';
    const toolkit = inferToolkitFromSlug(t.name, known);
    if (!toolkit) continue;
    out.push({ slug: t.name, description, toolkit });
  }
  return out;
}

/** Recover the toolkit slug from a Composio tool name like
 *  `GMAIL_SEND_EMAIL` → `gmail`. Cross-checks against the realtor's
 *  authorized toolkits so a rename or third-party prefix can't slip past. */
function inferToolkitFromSlug(slug: string, authorized: ReadonlySet<string>): string | null {
  // Composio's toolkit prefix is the leading underscore-separated chunk,
  // case-insensitive. `googlecalendar` and `googlesheets` are single tokens.
  const lower = slug.toLowerCase();
  // Try the exact authorized slugs first — handles `googlecalendar` etc.
  for (const t of authorized) {
    if (lower.startsWith(`${t}_`)) return t;
  }
  // Fallback: first underscore-separated chunk.
  const head = lower.split('_', 1)[0];
  return authorized.has(head) ? head : null;
}

// ── humanSummary resolution ───────────────────────────────────────────────

/**
 * Walk proposals, batch-read the Contacts and Deals they reference, and
 * write a Chippi-voice `humanSummary` onto each one. Names replace ID
 * slugs. At most ONE Contact query and ONE Deal query per request — the
 * orchestrator stack is capped at 5 actions, the lookups are tiny.
 *
 * The post-tour ceremony is the bid-for-10 surface; chat-side approval
 * prompts and the draft inbox have a different bar and continue to use
 * each tool's `summariseCall`. That's why this helper lives here, not
 * on the tool definitions — it's a per-surface elevation.
 */
export async function attachHumanSummaries(
  supabase: SupabaseClient,
  spaceId: string,
  proposals: ProposedAction[],
): Promise<ProposedAction[]> {
  if (proposals.length === 0) return proposals;

  const personIds = collectStringIds(proposals, 'personId');
  const dealIds = collectStringIds(proposals, 'dealId');

  const [personMap, dealMap] = await Promise.all([
    personIds.size > 0 ? readNames(supabase, 'Contact', 'name', spaceId, personIds) : Promise.resolve(new Map<string, string>()),
    dealIds.size > 0 ? readNames(supabase, 'Deal', 'title', spaceId, dealIds) : Promise.resolve(new Map<string, string>()),
  ]);

  return proposals.map((p) => {
    const human = formatHumanSummary(p, personMap, dealMap);
    return human ? { ...p, humanSummary: human } : p;
  });
}

function collectStringIds(proposals: ProposedAction[], key: 'personId' | 'dealId'): Set<string> {
  const out = new Set<string>();
  for (const p of proposals) {
    const v = p.args[key];
    if (typeof v === 'string' && v.length > 0) out.add(v);
  }
  return out;
}

async function readNames(
  supabase: SupabaseClient,
  table: 'Contact' | 'Deal',
  nameCol: 'name' | 'title',
  spaceId: string,
  ids: Set<string>,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from(table)
    .select(`id, ${nameCol}`)
    .eq('spaceId', spaceId)
    .in('id', Array.from(ids));
  const map = new Map<string, string>();
  for (const row of (data as Array<Record<string, unknown>> | null) ?? []) {
    const id = row.id;
    const name = row[nameCol];
    if (typeof id === 'string' && typeof name === 'string' && name.trim()) {
      map.set(id, name.trim());
    }
  }
  return map;
}

/** Per-verb format. Returns null when we can't do better than the fallback
 *  (no resolved name for the id the action references). */
export function formatHumanSummary(
  proposal: ProposedAction,
  people: Map<string, string>,
  deals: Map<string, string>,
): string | null {
  const a = proposal.args as Record<string, unknown>;
  const personName = typeof a.personId === 'string' ? people.get(a.personId) : undefined;
  const dealName = typeof a.dealId === 'string' ? deals.get(a.dealId) : undefined;

  // Integration proposals come from connected apps. The realtor doesn't
  // know integrations exist — show the verb, and a recipient name when we
  // can find one. NEVER a "via Gmail" badge.
  if (proposal.integrationToolkit) {
    const verb = realtorVerbForToolkit(proposal.integrationToolkit);
    if (personName) return `${verb} to ${personName}`;
    const recipient = pickFirstString(a, ['to', 'recipient', 'recipient_email', 'attendees', 'email']);
    return recipient ? `${verb} to ${recipient}` : verb;
  }

  switch (proposal.tool) {
    case 'log_call': {
      if (!personName) return null;
      const note = trimQuote(a.summary);
      return note ? `Log ${personName}'s call: "${note}"` : `Log ${personName}'s call`;
    }
    case 'log_meeting': {
      if (!personName) return null;
      const note = trimQuote(a.summary);
      const where = typeof a.location === 'string' && a.location.trim() ? ` at ${a.location.trim()}` : '';
      return note ? `Log ${personName}'s meeting${where}: "${note}"` : `Log ${personName}'s meeting${where}`;
    }
    case 'note_on_person': {
      if (!personName) return null;
      const content = trimQuote(a.content);
      return content ? `Note on ${personName}: "${content}"` : `Note on ${personName}`;
    }
    case 'note_on_deal': {
      if (!dealName) return null;
      const content = trimQuote(a.content);
      return content ? `Note on ${dealName}: "${content}"` : `Note on ${dealName}`;
    }
    case 'mark_person_hot': {
      if (!personName) return null;
      const why = trimReason(a.why);
      return why ? `Mark ${personName} hot — ${why}` : `Mark ${personName} hot`;
    }
    case 'mark_person_cold': {
      if (!personName) return null;
      const why = trimReason(a.why);
      return why ? `Mark ${personName} cold — ${why}` : `Mark ${personName} cold`;
    }
    case 'set_followup': {
      if (!personName) return null;
      const when = typeof a.when === 'string' ? prettifyWhen(a.when) : '';
      return when ? `Follow up with ${personName} on ${when}` : `Follow up with ${personName}`;
    }
    case 'draft_email': {
      if (!personName) return null;
      const intent = describeIntent(a.intent);
      return `Draft a ${intent} email to ${personName}`;
    }
    case 'draft_sms': {
      if (!personName) return null;
      const intent = describeIntent(a.intent);
      return `Draft a ${intent} text to ${personName}`;
    }
    default:
      return null;
  }
}

function trimQuote(v: unknown, max = 80): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function trimReason(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\.+$/, '');
  if (!t) return null;
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t;
}

function describeIntent(v: unknown): string {
  if (typeof v !== 'string') return 'check-in';
  switch (v) {
    case 'check-in': return 'check-in';
    case 'log-call': return 'follow-up';
    case 'welcome': return 'welcome';
    case 'reach-out': return 'reach-out';
    default: return 'check-in';
  }
}

// ── Integration verb resolution ───────────────────────────────────────────

/**
 * Realtor-voice verb for the proposal stack. The realtor doesn't know
 * the toolkit name; the verb tells the truth. "Email Sam Chen", not
 * "Send via Gmail to Sam Chen". Configuration-as-decision: one verb per
 * toolkit, no per-proposal channel picker.
 */
export function realtorVerbForToolkit(toolkit: string): string {
  switch (toolkit) {
    case 'gmail': return 'Email';
    case 'outlook': return 'Email';
    case 'googlecalendar': return 'Add to calendar';
    case 'outlook_calendar': return 'Add to calendar';
    case 'calendly': return 'Open Calendly slot';
    case 'cal': return 'Open Cal.com slot';
    case 'slack': return 'Post to Slack';
    case 'discord': return 'Post to Discord';
    case 'microsoft_teams': return 'Post to Teams';
    case 'notion': return 'Save in Notion';
    case 'googledocs': return 'Open in Google Docs';
    case 'googlesheets': return 'Update sheet';
    case 'googledrive': return 'Save to Drive';
    case 'onedrive': return 'Save to OneDrive';
    case 'dropbox': return 'Save to Dropbox';
    case 'hubspot': return 'Push to HubSpot';
    case 'salesforce': return 'Push to Salesforce';
    case 'pipedrive': return 'Push to Pipedrive';
    case 'zoho': return 'Push to Zoho';
    case 'docusign': return 'Send for signature';
    case 'dropbox_sign': return 'Send for signature';
    case 'asana': return 'Add task in Asana';
    case 'trello': return 'Add card in Trello';
    case 'linear': return 'Open issue in Linear';
    case 'monday': return 'Add item in Monday';
    case 'typeform': return 'Pull form responses';
    case 'googleforms': return 'Pull form responses';
    case 'zoom': return 'Schedule Zoom';
    case 'googlemeet': return 'Schedule Meet';
    case 'airtable': return 'Update Airtable';
    default: return 'Run connected action';
  }
}

/**
 * Done-sentence verb for the toast after execution. Past-tense, terse —
 * the realtor reads this on the way back to their car. Falls back to a
 * short toolkit-name confirmation when the slug isn't known. Returns
 * null when the toolkit is missing — the caller should drop it from the
 * done sentence rather than say "undefined fired".
 */
export function doneVerbForToolkit(toolkit: string | undefined): string | null {
  if (!toolkit) return null;
  switch (toolkit) {
    case 'gmail': return 'email sent';
    case 'outlook': return 'email sent';
    case 'googlecalendar': return 'on the calendar';
    case 'outlook_calendar': return 'on the calendar';
    case 'calendly': return 'Calendly slot booked';
    case 'cal': return 'Cal.com slot booked';
    case 'slack': return 'posted to Slack';
    case 'discord': return 'posted to Discord';
    case 'microsoft_teams': return 'posted to Teams';
    case 'notion': return 'saved in Notion';
    case 'googlesheets': return 'sheet updated';
    case 'googledocs': return 'doc updated';
    case 'googledrive': return 'saved to Drive';
    case 'onedrive': return 'saved to OneDrive';
    case 'dropbox': return 'saved to Dropbox';
    case 'hubspot': return 'pushed to HubSpot';
    case 'salesforce': return 'pushed to Salesforce';
    case 'pipedrive': return 'pushed to Pipedrive';
    case 'zoho': return 'pushed to Zoho';
    case 'docusign': return 'sent for signature';
    case 'dropbox_sign': return 'sent for signature';
    case 'asana': return 'task added';
    case 'trello': return 'card added';
    case 'linear': return 'issue opened';
    case 'monday': return 'item added';
    case 'zoom': return 'Zoom scheduled';
    case 'googlemeet': return 'Meet scheduled';
    case 'airtable': return 'Airtable updated';
    case 'typeform': return 'forms pulled';
    case 'googleforms': return 'forms pulled';
    default: return `${toolkit} fired`;
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────

/** Render an ISO date or weekday phrase as a clean human string ("Friday",
 *  "May 8"). Falls back to the raw string. Pure — no Date.now leakage. */
export function prettifyWhen(when: string, now: Date = new Date()): string {
  const raw = when.trim();
  if (!raw) return '';

  // ISO date
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return raw;
    const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
    const opts: Intl.DateTimeFormatOptions = sameYear
      ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
      : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
    return new Intl.DateTimeFormat('en-US', opts).format(d);
  }

  // weekday phrase — capitalise first letter of each word
  return raw
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}
