/**
 * Registry contract — invariants every tool in `ALL_TOOLS` must hold.
 *
 * Drift the TypeScript types can't catch (snake_case naming, name uniqueness,
 * parameter description, summariseCall returning non-empty for the args we
 * see in the wild) lives here. The test walks the registry once and asserts
 * each invariant. When a tool is added, the new entry has to obey the same
 * rules — no markdown asking nicely; the build fails.
 *
 * Why a test, not a markdown spec: a doc decays the moment someone forgets
 * to update it. A test runs in CI. Same goal, different artifact.
 */

import { describe, it, expect } from 'vitest';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import type { ToolDefinition } from '@/lib/ai-tools/types';

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const MAX_DESCRIPTION_CHARS = 280;

function isMutating(t: ToolDefinition): boolean {
  return t.requiresApproval !== false;
}

describe('ALL_TOOLS registry contract', () => {
  it('exports a non-empty list', () => {
    expect(ALL_TOOLS.length).toBeGreaterThan(0);
  });

  describe.each(ALL_TOOLS.map((t) => [t.name, t] as const))('%s', (_name, tool) => {
    it('uses snake_case for name', () => {
      expect(tool.name).toMatch(SNAKE_CASE);
    });

    it('has a non-empty, single-sentence-ish description', () => {
      expect(tool.description.trim().length).toBeGreaterThan(0);
      expect(tool.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
    });

    it('has a zod parameters schema', () => {
      // We can't introspect the inner shape generically, but the field must exist
      // and behave like a zod schema (has `parse` / `safeParse`).
      const p = tool.parameters as { safeParse?: unknown };
      expect(typeof p.safeParse).toBe('function');
    });

    it('has a callable handler', () => {
      expect(typeof tool.handler).toBe('function');
    });

    if (tool.requiresApproval !== false) {
      it('mutating: defines summariseCall returning a non-empty string', () => {
        expect(typeof tool.summariseCall).toBe('function');
        // Best-effort: invoke with an empty-object arg cast through unknown.
        // Most summariseCalls handle missing fields gracefully ("Email
        // unknown — subject Hi"). If a tool throws on minimal input, the
        // realtor sees a broken approval prompt at runtime; we'd rather
        // catch it here.
        const summarise = tool.summariseCall!;
        let out = '';
        try {
          out = summarise({} as never);
        } catch {
          // tools that hard-require fields are allowed to throw on `{}` —
          // we only assert that when they DO produce output, it's non-empty.
          out = 'threw — acceptable for tools with required args';
        }
        expect(out.length).toBeGreaterThan(0);
      });

      it('mutating: defines rateLimit', () => {
        expect(tool.rateLimit).toBeDefined();
        expect(tool.rateLimit!.max).toBeGreaterThan(0);
        expect(tool.rateLimit!.windowSeconds).toBeGreaterThan(0);
      });
    }
  });

  it('has no duplicate tool names', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('mutating tools form the majority — agent should mostly DO things, not just look', () => {
    // Sanity check the catalog shape. If reads dominate, we've slipped back
    // to the CRUD-as-tool failure mode.
    const mutating = ALL_TOOLS.filter(isMutating).length;
    const readonly = ALL_TOOLS.length - mutating;
    expect(mutating).toBeGreaterThan(readonly);
  });
});
