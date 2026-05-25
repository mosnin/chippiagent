/**
 * Schema-compliance regression catcher.
 *
 * Walks EVERY registered tool, runs it through `toSdkTool`, and asserts
 * the resulting JSON schema is strict-mode compatible — i.e. has none of
 * the keys OpenAI rejects when a tool is registered with `strict: true`.
 *
 * The chat agent runs every tool through the SDK's strict-mode validator
 * on every conversation. If any tool's schema has a forbidden key
 * anywhere in its tree, OpenAI rejects the tool list and the entire
 * chat dies before the first model token streams. We've hit this in
 * production with `format: "uri"`, `format: "date-time"`, `minLength`,
 * etc. — each new tool that uses an idiomatic zod validator was a new
 * way to break the chat.
 *
 * This test is the regression catcher we should have had from day one.
 * It runs on every commit, has zero external dependencies, and will
 * fail loudly the moment a new tool ships with an incompatible
 * validator.
 *
 * If this test fires:
 *   1. The error message names the offending tool + the offending key.
 *   2. The fix is to either (a) extend `strictifySchema` to handle
 *      that case, or (b) the tool author can rewrite the schema to
 *      avoid the validator (e.g., drop `.url()` and validate inside
 *      the handler instead).
 */

import { describe, it, expect } from 'vitest';
import { toSdkTool } from '@/lib/ai-tools/sdk-bridge';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'u_strict',
    space: { id: 's_strict', slug: 'strict', name: 'Strict', ownerId: 'u_strict' },
    signal: new AbortController().signal,
  };
}

const STRICT_MODE_BANNED_KEYS = [
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'pattern',
  'multipleOf',
  'minProperties',
  'maxProperties',
  'uniqueItems',
] as const;

/**
 * Recursively walk a JSON schema and collect every (path, key, value)
 * triple where `key` is banned by OpenAI strict mode. Returns an empty
 * array on a clean schema.
 */
function findBannedKeys(
  schema: unknown,
  path: string[] = [],
): Array<{ path: string; key: string; value: unknown }> {
  const findings: Array<{ path: string; key: string; value: unknown }> = [];
  if (!schema || typeof schema !== 'object') return findings;
  if (Array.isArray(schema)) {
    schema.forEach((item, i) => {
      findings.push(...findBannedKeys(item, [...path, String(i)]));
    });
    return findings;
  }
  const obj = schema as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (STRICT_MODE_BANNED_KEYS.includes(key as (typeof STRICT_MODE_BANNED_KEYS)[number])) {
      findings.push({ path: path.join('.'), key, value });
    }
    if (value && typeof value === 'object') {
      findings.push(...findBannedKeys(value, [...path, key]));
    }
  }
  return findings;
}

describe('every registered tool produces a strict-mode-compatible JSON schema', () => {
  // Deduplicate any cases where ALL_TOOLS contained the same name twice
  // (the registry contract test catches duplicate names separately; this
  // test is just defending its own input).
  const tools = Array.from(
    new Map(ALL_TOOLS.map((t) => [t.name, t])).values(),
  );

  it.each(tools.map((t) => [t.name, t] as const))(
    '%s',
    (_name, tool) => {
      const sdk = toSdkTool(tool, makeCtx());
      const schema = (sdk as { parameters: unknown }).parameters;
      const findings = findBannedKeys(schema);
      if (findings.length > 0) {
        const msg = findings
          .map((f) => `  • at path "${f.path}": ${f.key} = ${JSON.stringify(f.value)}`)
          .join('\n');
        throw new Error(
          `Tool "${tool.name}" has strict-mode-incompatible JSON-schema keys after toSdkTool:\n${msg}\n\n` +
            `Either extend lib/ai-tools/sdk-bridge.ts strictifySchema() to strip the new key, ` +
            `or rewrite the tool's zod schema to avoid the validator that produces it.`,
        );
      }
    },
  );

  it('the registry has at least 30 tools to catch (sanity bound)', () => {
    expect(tools.length).toBeGreaterThanOrEqual(30);
  });
});
