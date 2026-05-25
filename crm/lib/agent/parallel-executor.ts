/**
 * parallel-executor.ts
 *
 * Fans out independent SubgoalStep executions concurrently while respecting
 * declared dependency ordering.  Uses Kahn's BFS topological sort to build
 * execution "waves" — each wave is a set of steps whose dependencies have all
 * resolved.  Waves run with Promise.allSettled(); a failed step marks all
 * transitive dependents as skipped instead of failed, letting unrelated steps
 * continue.
 */

// ── Public types ──────────────────────────────────────────────────────────────

export interface StepResult {
  stepId: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
  durationMs: number;
}

/**
 * The computed execution plan.
 *
 * `waves`      — ordered list of concurrency groups; every step in wave N must
 *                finish before wave N+1 begins.
 * `dependents` — reverse-adjacency: stepId → IDs of steps that depend on it.
 *                Used to propagate skips when a step fails.
 */
export interface DependencyGraph {
  waves: string[][];
  dependents: Map<string, string[]>;
}

// ── Core: buildDependencyGraph ────────────────────────────────────────────────

/**
 * Pure function — safe to unit-test in isolation.
 *
 * Implements Kahn's BFS-based topological sort:
 *   1. Compute in-degree (number of unresolved prerequisites) for every step.
 *   2. Seed the queue with every step that has in-degree 0.
 *   3. Each BFS "level" becomes one wave.
 *   4. After BFS, any step still with in-degree > 0 is part of a cycle → throw.
 *
 * Steps that do not appear in the `steps` array but are referenced as
 * dependsOnStepId are silently ignored (defensive: the caller controls both).
 */
export function buildDependencyGraph(
  steps: Array<{ id: string }>,
  dependencies: Array<{ stepId: string; dependsOnStepId: string }>,
): DependencyGraph {
  const stepIds = new Set(steps.map(s => s.id));

  // in-degree: how many prerequisites each step still has
  const inDegree = new Map<string, number>();
  for (const s of steps) {
    inDegree.set(s.id, 0);
  }

  // forward adjacency (prerequisite → dependents) for wave propagation
  // also used to build the returned `dependents` map
  const dependents = new Map<string, string[]>();
  for (const s of steps) {
    dependents.set(s.id, []);
  }

  for (const dep of dependencies) {
    const { stepId, dependsOnStepId } = dep;

    // Skip edges that reference unknown steps
    if (!stepIds.has(stepId) || !stepIds.has(dependsOnStepId)) continue;
    // Skip self-loops (the DB CHECK constraint forbids them, but be safe)
    if (stepId === dependsOnStepId) continue;

    inDegree.set(stepId, (inDegree.get(stepId) ?? 0) + 1);
    dependents.get(dependsOnStepId)!.push(stepId);
  }

  // Kahn's BFS — level-by-level to produce waves
  const waves: string[][] = [];
  let frontier: string[] = [];

  for (const [id, deg] of inDegree) {
    if (deg === 0) frontier.push(id);
  }

  let visited = 0;

  while (frontier.length > 0) {
    waves.push([...frontier]);
    visited += frontier.length;

    const next: string[] = [];
    for (const nodeId of frontier) {
      for (const dependent of dependents.get(nodeId) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) {
          next.push(dependent);
        }
      }
    }
    frontier = next;
  }

  if (visited < steps.length) {
    throw new Error('Circular dependency detected');
  }

  return { waves, dependents };
}

// ── Core: runParallel ─────────────────────────────────────────────────────────

/**
 * Convenience entry-point — handles the common zero-dependency case (all steps
 * land in one wave) and the full dependency-ordered case equally.
 *
 * Failure semantics:
 *   • A step that throws → status 'failed'; all *direct and transitive*
 *     dependents are marked 'skipped'.
 *   • Skipped steps are never passed to executeFn.
 *   • Non-dependent steps in later waves still execute normally.
 */
export async function runParallel(
  steps: Array<{ id: string; [k: string]: unknown }>,
  executeFn: (step: { id: string; [k: string]: unknown }) => Promise<unknown>,
  dependencies?: Array<{ stepId: string; dependsOnStepId: string }>,
): Promise<StepResult[]> {
  const graph = buildDependencyGraph(steps, dependencies ?? []);
  return _executeGraph(steps, executeFn, graph);
}

// ── Shared execution engine ───────────────────────────────────────────────────

async function _executeGraph(
  steps: Array<{ id: string; [k: string]: unknown }>,
  executeFn: (step: { id: string; [k: string]: unknown }) => Promise<unknown>,
  graph: DependencyGraph,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  // skipped accumulates transitively — once a step is skipped its dependents
  // are also marked skipped before their wave runs.
  const skipped = new Set<string>();

  for (const wave of graph.waves) {
    // Propagate skips before executing this wave — a prior-wave failure may
    // have already added items from this wave to `skipped`.
    const toRun = wave.filter(id => !skipped.has(id));

    const settled = await Promise.allSettled(
      toRun.map(async (stepId): Promise<StepResult> => {
        const step = steps.find(s => s.id === stepId)!;
        const start = Date.now();
        try {
          const output = await executeFn(step);
          return {
            stepId,
            status: 'completed',
            output,
            durationMs: Date.now() - start,
          };
        } catch (err) {
          // Mark all downstream dependents as skipped (transitively)
          _propagateSkip(stepId, graph.dependents, skipped);
          return {
            stepId,
            status: 'failed',
            error: String(err),
            durationMs: Date.now() - start,
          };
        }
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        // Promise.allSettled should never reject — the inner try/catch handles
        // executeFn errors.  This branch guards against bugs in the executor
        // itself (e.g. the steps.find returning undefined and throwing).
        results.push({
          stepId: '?',
          status: 'failed',
          error: String(outcome.reason),
          durationMs: 0,
        });
      }
    }

    // Emit skipped results for steps in this wave that were bypassed
    for (const stepId of wave) {
      if (skipped.has(stepId) && !results.some(r => r.stepId === stepId)) {
        results.push({ stepId, status: 'skipped', durationMs: 0 });
      }
    }
  }

  return results;
}

/**
 * Recursively marks `root` and all of its dependents as skipped.
 * Uses iteration rather than recursion to avoid stack overflow on deep graphs.
 */
function _propagateSkip(
  root: string,
  dependents: Map<string, string[]>,
  skipped: Set<string>,
): void {
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dep of dependents.get(current) ?? []) {
      if (!skipped.has(dep)) {
        skipped.add(dep);
        queue.push(dep);
      }
    }
  }
}

// ── ParallelExecutor class ────────────────────────────────────────────────────

/**
 * Stateful wrapper for callers that want to inspect the computed graph before
 * running, or reuse the same executor across multiple runs.
 */
export class ParallelExecutor {
  private readonly _steps: Array<{ id: string; [k: string]: unknown }>;
  private readonly _deps: Array<{ stepId: string; dependsOnStepId: string }>;

  constructor(
    steps: Array<{ id: string; [k: string]: unknown }>,
    deps: Array<{ stepId: string; dependsOnStepId: string }> = [],
  ) {
    this._steps = steps;
    this._deps = deps;
  }

  /** Returns the precomputed DependencyGraph for inspection or testing. */
  graph(): DependencyGraph {
    return buildDependencyGraph(this._steps, this._deps);
  }

  /** Executes all steps respecting the dependency graph. */
  async run(
    executeFn: (step: { id: string; [k: string]: unknown }) => Promise<unknown>,
  ): Promise<StepResult[]> {
    return runParallel(this._steps, executeFn, this._deps);
  }
}
