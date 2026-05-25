/**
 * Editorial-voice file discovery.
 *
 * The editorial test scans a set of source files for forbidden phrases,
 * anti-patterns, emoji, and tone violations. The set used to be hand-curated
 * — 13 paths, hard-coded — which meant every new user-facing surface had to
 * be added by a human, or the rules silently stopped applying. That's the
 * opposite of how a hard rule works.
 *
 * Discovery rules (the ONLY tunable knobs are EXCLUDES below):
 *   INCLUDE
 *     - app/**\/*.{tsx,ts}
 *     - components/**\/*.{tsx,ts}
 *     - lib/morning-story.ts
 *     - lib/morning-story-agent.ts
 *     - lib/narration/**\/*.ts (if the directory exists)
 *   EXCLUDE
 *     - **\/__tests__/**, *.test.{ts,tsx}, *.spec.{ts,tsx}     (test code)
 *     - app/(auth)/**\/page.tsx, app/admin/**\/page.tsx,
 *       app/api/**\/page.tsx                                    (system-y copy)
 *     - **\/*.d.ts                                              (type declarations)
 *     - node_modules/**, .next/**, dist/**, build/**           (generated)
 *     - files >= 50 KB                                         (fixtures/generated)
 *
 * The discovery is hard-coded into one function. If you find yourself wanting
 * to add a "configurable inclusion mode," stop — pick instead.
 */
import { readdirSync, statSync, existsSync } from 'fs';
import { join, relative, sep } from 'path';

const MAX_BYTES = 50 * 1024;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  '__tests__',
]);

/** Recursive walker. Skips obvious junk dirs at the directory level so we
 * never even stat their contents. */
function walk(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...walk(join(dir, e.name)));
    } else if (e.isFile() || e.isSymbolicLink()) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

/** Posix-style relative path so the regexes below are platform-independent. */
function rel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/');
}

function isCodeFile(relPath: string): boolean {
  return /\.(tsx|ts)$/.test(relPath);
}

function isExcluded(relPath: string): boolean {
  if (/\.d\.ts$/.test(relPath)) return true;
  if (/(^|\/)__tests__\//.test(relPath)) return true;
  if (/\.(test|spec)\.(ts|tsx)$/.test(relPath)) return true;

  // Whole trees we never audit:
  //   - app/(auth)/**  Clerk/system flows; copy isn't Chippi's voice.
  //   - app/admin/**   Internal tooling; not the user's product.
  //   - app/api/**     Route handlers; wire format, not UI copy.
  if (/^app\/\(auth\)\//.test(relPath)) return true;
  if (/^app\/admin\//.test(relPath)) return true;
  if (/^app\/api\//.test(relPath)) return true;

  return false;
}

/** Discover the set of files the editorial test must audit.
 *
 * `root` is the repository root. The function reads from the live filesystem;
 * the test treats this as the canonical reference. */
export function discoverEditorialFiles(root: string): string[] {
  const candidates: string[] = [];

  // app/** and components/** — full recursive walks.
  for (const top of ['app', 'components'] as const) {
    const abs = join(root, top);
    if (!existsSync(abs)) continue;
    candidates.push(...walk(abs));
  }

  // Specific lib files where prompts and ladder text live.
  for (const lib of ['lib/morning-story.ts', 'lib/morning-story-agent.ts'] as const) {
    const abs = join(root, lib);
    if (existsSync(abs)) candidates.push(abs);
  }

  // lib/narration/** — only if the directory exists.
  const narration = join(root, 'lib', 'narration');
  if (existsSync(narration)) {
    candidates.push(...walk(narration));
  }

  const out: string[] = [];
  for (const abs of candidates) {
    const r = rel(root, abs);
    if (!isCodeFile(r)) continue;
    if (isExcluded(r)) continue;
    try {
      const s = statSync(abs);
      if (s.size >= MAX_BYTES) continue;
    } catch {
      continue;
    }
    out.push(r);
  }

  // Deterministic ordering so test failure messages don't shuffle between runs.
  out.sort();
  return out;
}
