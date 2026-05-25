/**
 * Tests for lib/agent/parallel-executor.ts
 * Covers KR1–KR5 from the parallel-executor OKR spec.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDependencyGraph,
  runParallel,
  ParallelExecutor,
} from '../parallel-executor';

// ── buildDependencyGraph (pure function) ──────────────────────────────────────

describe('buildDependencyGraph', () => {
  it('KR1: produces correct waves for a diamond DAG', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const deps = [
      { stepId: 'b', dependsOnStepId: 'a' },
      { stepId: 'c', dependsOnStepId: 'a' },
      { stepId: 'd', dependsOnStepId: 'b' },
      { stepId: 'd', dependsOnStepId: 'c' },
    ];
    const graph = buildDependencyGraph(steps, deps);
    expect(graph.waves[0]).toEqual(['a']);
    expect([...graph.waves[1]].sort()).toEqual(['b', 'c']);
    expect(graph.waves[2]).toEqual(['d']);
    expect(graph.waves).toHaveLength(3);
  });

  it('KR1: builds correct dependents map', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const deps = [
      { stepId: 'b', dependsOnStepId: 'a' },
      { stepId: 'c', dependsOnStepId: 'a' },
    ];
    const graph = buildDependencyGraph(steps, deps);
    expect([...(graph.dependents.get('a') ?? [])].sort()).toEqual(['b', 'c']);
    expect(graph.dependents.get('b')).toEqual([]);
    expect(graph.dependents.get('c')).toEqual([]);
  });

  it('KR4: is a pure function — deterministic across calls', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const deps = [{ stepId: 'b', dependsOnStepId: 'a' }];
    const g1 = buildDependencyGraph(steps, deps);
    const g2 = buildDependencyGraph(steps, deps);
    expect(JSON.stringify(g1.waves)).toEqual(JSON.stringify(g2.waves));
  });

  it('KR5: zero dependencies → single wave with all steps', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const graph = buildDependencyGraph(steps, []);
    expect(graph.waves).toHaveLength(1);
    expect([...graph.waves[0]].sort()).toEqual(['a', 'b', 'c']);
  });

  it('detects circular dependencies', () => {
    const steps = [{ id: 'x' }, { id: 'y' }];
    const deps = [
      { stepId: 'x', dependsOnStepId: 'y' },
      { stepId: 'y', dependsOnStepId: 'x' },
    ];
    expect(() => buildDependencyGraph(steps, deps)).toThrow('Circular dependency detected');
  });

  it('silently ignores edges referencing unknown steps', () => {
    const steps = [{ id: 'a' }, { id: 'b' }];
    // 'ghost' does not exist → edge dropped → b has in-degree 0 → both in wave 0
    const deps = [{ stepId: 'b', dependsOnStepId: 'ghost' }];
    const graph = buildDependencyGraph(steps, deps);
    expect(graph.waves).toHaveLength(1);
  });

  it('ignores self-loop edges', () => {
    const steps = [{ id: 'a' }];
    const deps = [{ stepId: 'a', dependsOnStepId: 'a' }];
    const graph = buildDependencyGraph(steps, deps);
    expect(graph.waves).toHaveLength(1);
    expect(graph.waves[0]).toEqual(['a']);
  });
});

// ── runParallel ───────────────────────────────────────────────────────────────

describe('runParallel', () => {
  it('KR2: fans out independent steps concurrently', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const start = Date.now();
    const results = await runParallel(steps, async (step) => {
      await new Promise<void>(r => setTimeout(r, 50));
      return 'ok-' + step.id;
    });
    const elapsed = Date.now() - start;
    // 3 sequential calls × 50ms = 150ms; parallel should complete in < 120ms
    expect(elapsed).toBeLessThan(120);
    expect(results).toHaveLength(3);
    expect(results.every(r => r.status === 'completed')).toBe(true);
    expect(results.every(r => (r.durationMs ?? 0) >= 40)).toBe(true);
    expect(results.every(r => r.output === 'ok-' + r.stepId)).toBe(true);
  });

  it('KR2: executes dependency-ordered steps in correct wave order', async () => {
    const order: string[] = [];
    const steps = [{ id: 'a' }, { id: 'b' }];
    const deps = [{ stepId: 'b', dependsOnStepId: 'a' }];
    await runParallel(steps, async (step) => {
      order.push(step.id as string);
    }, deps);
    expect(order[0]).toBe('a');
    expect(order[1]).toBe('b');
  });

  it('KR3: failed step marks direct dependents as skipped', async () => {
    const steps = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    // z is independent; y depends on x (which will fail)
    const deps = [{ stepId: 'y', dependsOnStepId: 'x' }];
    const results = await runParallel(steps, async (step) => {
      if (step.id === 'x') throw new Error('x failed');
      return 'done';
    }, deps);
    const byId = Object.fromEntries(results.map(r => [r.stepId, r]));
    expect(byId['x'].status).toBe('failed');
    expect(byId['x'].error).toContain('x failed');
    expect(byId['y'].status).toBe('skipped');
    // z is NOT a dependent of x — must still complete
    expect(byId['z'].status).toBe('completed');
  });

  it('KR3: skips propagate transitively through the dependency chain', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const deps = [
      { stepId: 'b', dependsOnStepId: 'a' },
      { stepId: 'c', dependsOnStepId: 'b' },
      { stepId: 'd', dependsOnStepId: 'c' },
    ];
    const results = await runParallel(steps, async (step) => {
      if (step.id === 'a') throw new Error('root failure');
      return 'ok';
    }, deps);
    const byId = Object.fromEntries(results.map(r => [r.stepId, r]));
    expect(byId['a'].status).toBe('failed');
    expect(byId['b'].status).toBe('skipped');
    expect(byId['c'].status).toBe('skipped');
    expect(byId['d'].status).toBe('skipped');
  });

  it('returns results for all steps including skipped ones', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }];
    const deps = [{ stepId: 'b', dependsOnStepId: 'a' }];
    const results = await runParallel(
      steps,
      async () => { throw new Error('fail'); },
      deps,
    );
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.stepId).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('KR5: works with no dependencies (default empty array)', async () => {
    const steps = [{ id: 'p' }, { id: 'q' }];
    const results = await runParallel(steps, async (step) => step.id);
    expect(results.every(r => r.status === 'completed')).toBe(true);
  });
});

// ── ParallelExecutor class ────────────────────────────────────────────────────

describe('ParallelExecutor', () => {
  it('KR1: graph() returns DependencyGraph with correct waves', () => {
    const steps = [{ id: 'a' }, { id: 'b' }];
    const deps = [{ stepId: 'b', dependsOnStepId: 'a' }];
    const executor = new ParallelExecutor(steps, deps);
    const graph = executor.graph();
    expect(graph.waves).toHaveLength(2);
    expect(graph.waves[0]).toEqual(['a']);
    expect(graph.waves[1]).toEqual(['b']);
  });

  it('KR2: run() executes all steps and returns StepResults', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const executor = new ParallelExecutor(steps);
    const results = await executor.run(async (step) => 'result-' + step.id);
    expect(results).toHaveLength(3);
    expect(results.every(r => r.status === 'completed')).toBe(true);
    expect(results.every(r => r.output === 'result-' + r.stepId)).toBe(true);
  });

  it('KR5: default deps parameter is empty — single wave', () => {
    const steps = [{ id: 'a' }, { id: 'b' }];
    const executor = new ParallelExecutor(steps); // no deps arg
    const graph = executor.graph();
    expect(graph.waves).toHaveLength(1);
    expect([...graph.waves[0]].sort()).toEqual(['a', 'b']);
  });
});
