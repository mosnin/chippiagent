/**
 * SKILL.md loader — Anthropic Agent Skills convention adapted to OpenAI Agents SDK.
 *
 * Each subdirectory of `lib/ai-tools/skills/` contains one `SKILL.md`:
 *
 *   ---
 *   name: snake_case_name
 *   description: One-line description Anthropic-spec compliant (≤1024 chars).
 *   model: gpt-5-mini
 *   tools:
 *     - tool_one
 *     - tool_two
 *   ---
 *   Free-form markdown body — becomes the agent's `instructions`.
 *
 * Frontmatter fields:
 *   - `name` (required) — passed to `new Agent({ name })`. We use snake_case
 *     to match the existing Agent names; Anthropic's spec recommends
 *     kebab-case but OpenAI Agents SDK accepts any string and a rename
 *     would break observability/telemetry that's keyed on the current names.
 *   - `description` (required) — Anthropic spec field; used here for
 *     loader-time validation and future cross-tool portability. The OpenAI
 *     SDK doesn't have a direct field for it; the tool description set
 *     at `.asTool()` time is what the parent agent sees.
 *   - `model` (optional) — defaults to gpt-5-mini.
 *   - `tools` (optional) — array of tool names from `ALL_TOOLS`. Unknown
 *     names throw at build time so a typo is a boot failure, not a silent
 *     runtime miss.
 *   - `title` + `prompt` (optional, paired) — make the skill user-invocable
 *     from the chat's `/` menu. `title` is the menu label; `prompt` is the
 *     text dropped into the composer when the skill is picked (it may carry
 *     one `{placeholder}` for the realtor to fill in). A skill appears in
 *     the menu only when BOTH are present — there is no separate flag.
 *   - `order` (optional) — sort position in the `/` menu; lower is higher.
 *
 * Anthropic convention bits we explicitly dropped:
 *   - `allowed-tools` (we use `tools`, simpler), `disable-model-invocation`,
 *     `user-invocable`, `argument-hint`, `arguments`, `context: fork`,
 *     `hooks`, `paths`, `shell`, `!\`shell\`` injection. All Claude Code
 *     REPL-specific; meaningless on the OpenAI Agents SDK side.
 *
 * Hot-reload is NOT implemented. Restart the process to pick up new skills.
 * Anthropic's Claude Code does fs.watchFile() on known paths; replicating
 * that here is ~30 lines of chokidar glue and doesn't earn its place at
 * Chippi's current scale (3 skills). Add if/when the count crosses ~20.
 *
 * Bundling note: skills are loaded at module-init time via `process.cwd()`-
 * relative paths so Next.js's output tracer follows the readFileSync calls
 * and includes the .md files in production deploys. If deploys ever break
 * with "ENOENT SKILL.md", add `outputFileTracingIncludes` to next.config.ts.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Agent } from '@openai/agents';
import { toSdkTool } from '../sdk-bridge';
import { ALL_TOOLS } from '../tools';
import type { ToolContext, ToolDefinition } from '../types';

const DEFAULT_MODEL = 'gpt-5-mini';

interface SkillFrontmatter {
  name: string;
  description: string;
  model?: string;
  tools?: string[];
  /** Menu label — present (with `prompt`) iff the skill is user-invocable. */
  title?: string;
  /** Composer text dropped in when the skill is picked from the `/` menu. */
  prompt?: string;
  /** Sort position in the `/` menu; lower is higher. */
  order?: number;
}

export interface SkillDefinition {
  slug: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

/**
 * Minimal YAML frontmatter parser. We support exactly what SKILL.md uses:
 * scalar strings, single-line scalars, and YAML block arrays (`- item`).
 * Anything else (block scalars, nested objects, multi-doc) throws or is
 * ignored. Pulling in `js-yaml` for ~30 lines of regex is ceremony.
 */
function parseFrontmatter(text: string, sourceForError: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`${sourceForError}: missing YAML frontmatter (--- ... ---)`);
  }
  const [, fmText, body] = match;
  const fm: Record<string, unknown> = {};
  const lines = fmText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    const trimmed = rest.trim();

    if (trimmed === '') {
      // YAML block array on the following indented lines.
      const arr: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        arr.push(lines[i + 1].replace(/^\s+-\s+/, '').trim());
        i++;
      }
      fm[key] = arr;
    } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      // Inline array: [a, b, c]
      fm[key] = trimmed
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      // Scalar string; strip optional surrounding quotes.
      fm[key] = trimmed.replace(/^["']|["']$/g, '');
    }
  }

  if (typeof fm.name !== 'string' || !fm.name) {
    throw new Error(`${sourceForError}: frontmatter missing required \`name\``);
  }
  if (typeof fm.description !== 'string' || !fm.description) {
    throw new Error(`${sourceForError}: frontmatter missing required \`description\``);
  }

  const orderRaw = typeof fm.order === 'string' ? Number(fm.order) : NaN;
  return {
    frontmatter: {
      name: fm.name,
      description: fm.description,
      model: typeof fm.model === 'string' ? fm.model : undefined,
      tools: Array.isArray(fm.tools) ? (fm.tools as string[]) : undefined,
      title: typeof fm.title === 'string' ? fm.title : undefined,
      prompt: typeof fm.prompt === 'string' ? fm.prompt : undefined,
      order: Number.isFinite(orderRaw) ? orderRaw : undefined,
    },
    body: body.trim(),
  };
}

// process.cwd() is the project root in both `next dev` and Vercel server
// runtimes. Resolving from cwd keeps the loader independent of the
// compiled JS bundle's location.
const SKILLS_DIR = join(process.cwd(), 'lib/ai-tools/skills');

let _cached: SkillDefinition[] | null = null;

/** Read every `<slug>/SKILL.md` once; cached for the process lifetime. */
export function loadSkillDefinitions(): SkillDefinition[] {
  if (_cached) return _cached;

  const entries: SkillDefinition[] = [];
  let dirContents: string[];
  try {
    dirContents = readdirSync(SKILLS_DIR);
  } catch (err) {
    // No skills directory = no skills. The chat path still works; it just
    // won't have specialists. Better than a noisy boot crash.
    return (_cached = []);
  }

  for (const slug of dirContents) {
    const dir = join(SKILLS_DIR, slug);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const skillPath = join(dir, 'SKILL.md');
    let text: string;
    try {
      text = readFileSync(skillPath, 'utf-8');
    } catch {
      continue;
    }
    const { frontmatter, body } = parseFrontmatter(text, `${slug}/SKILL.md`);
    entries.push({ slug, frontmatter, body });
  }

  // Sort by slug so iteration order is stable (matters for prompt caching:
  // any list of skills inserted into a prompt should hash identically
  // across runs).
  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  _cached = entries;
  return entries;
}

/** Reset the cache. Test-only — production should never need this. */
export function __resetSkillCacheForTests(): void {
  _cached = null;
}

/** A skill the realtor can invoke from the chat `/` menu. */
export interface UserSkill {
  slug: string;
  title: string;
  description: string;
  /** Composer text; may contain one `{placeholder}` for the realtor to fill. */
  prompt: string;
}

/**
 * The skills offered in the chat `/` menu — every skill that declares both
 * a `title` and a `prompt` — ordered by the frontmatter `order` (lower
 * first), then by slug. A skill is just a prompt: picking one drops its
 * text into the composer, and sending it is an ordinary chat turn, so this
 * works against the live Modal chat with no extra runtime.
 */
export function loadUserInvocableSkills(): UserSkill[] {
  return loadSkillDefinitions()
    .filter((d) => d.frontmatter.title && d.frontmatter.prompt)
    .map((d) => ({
      slug: d.slug,
      title: d.frontmatter.title as string,
      description: d.frontmatter.description,
      prompt: d.frontmatter.prompt as string,
      order: d.frontmatter.order ?? 100,
    }))
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
    .map(({ slug, title, description, prompt }) => ({ slug, title, description, prompt }));
}

function pickTools(names: readonly string[], slug: string): ToolDefinition[] {
  const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
  return names.map((n) => {
    const t = byName.get(n);
    if (!t) {
      throw new Error(`skill loader: skill "${slug}" references unknown tool "${n}"`);
    }
    return t;
  });
}

/**
 * Build a Skill into a concrete OpenAI Agents SDK Agent. The caller wires
 * `ctx` per-request (it carries spaceId, userId, signal — the security
 * boundary). Tools are filtered from the global ALL_TOOLS registry by name.
 */
export function buildSkillAgent(
  slug: string,
  ctx: ToolContext,
  opts: { model?: string } = {},
): Agent {
  const def = loadSkillDefinitions().find((d) => d.slug === slug);
  if (!def) {
    throw new Error(`skill loader: no skill found with slug "${slug}"`);
  }
  const tools = pickTools(def.frontmatter.tools ?? [], slug).map((t) => toSdkTool(t, ctx));
  return new Agent({
    name: def.frontmatter.name,
    instructions: def.body,
    tools,
    model: opts.model ?? def.frontmatter.model ?? DEFAULT_MODEL,
  });
}
