'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArtifactVersion {
  id: string;
  versionNumber: number;
  content: string;
  createdAt: string;
}

export interface ArtifactDiffProps {
  versionA: ArtifactVersion;
  versionB: ArtifactVersion;
}

// ─── Diff algorithm (LCS-based, no external deps) ────────────────────────────

type DiffOp = { type: 'unchanged' | 'removed' | 'added'; line: string };

/**
 * Computes a unified line diff between two texts using a standard
 * LCS (longest common subsequence) dynamic-programming algorithm.
 * O(m*n) space and time — fine for document-sized content.
 */
function diffLines(textA: string, textB: string): DiffOp[] {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const m = linesA.length;
  const n = linesB.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff ops
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.push({ type: 'unchanged', line: linesA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'added', line: linesB[j - 1] });
      j--;
    } else {
      ops.push({ type: 'removed', line: linesA[i - 1] });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────

function countOps(ops: DiffOp[]) {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === 'added') added++;
    else if (op.type === 'removed') removed++;
  }
  return { added, removed, unchanged: ops.length - added - removed };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ArtifactDiff({ versionA, versionB }: ArtifactDiffProps) {
  const ops = diffLines(versionA.content, versionB.content);
  const { added, removed } = countOps(ops);
  const noChanges = added === 0 && removed === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Version badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border border-border/60 bg-muted text-muted-foreground">
          v{versionA.versionNumber}
        </span>
        <span className="text-xs text-muted-foreground">→</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border border-border/60 bg-muted text-foreground">
          v{versionB.versionNumber}
        </span>

        {/* Change summary */}
        {!noChanges && (
          <span className="ml-auto flex items-center gap-2 text-[11px] font-mono">
            {added > 0 && (
              <span className="text-green-700 dark:text-green-400">+{added}</span>
            )}
            {removed > 0 && (
              <span className="text-red-700 dark:text-red-400">−{removed}</span>
            )}
          </span>
        )}
      </div>

      {/* Diff body */}
      <div className="rounded-lg border border-border/60 overflow-x-auto">
        {noChanges ? (
          <p className="text-xs text-muted-foreground text-center py-6 font-mono">
            No differences between these versions.
          </p>
        ) : (
          <div className="font-mono text-xs leading-5">
            {ops.map((op, idx) => {
              const prefix =
                op.type === 'added' ? '+' : op.type === 'removed' ? '−' : ' ';
              const rowClass =
                op.type === 'added'
                  ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300'
                  : op.type === 'removed'
                  ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                  : 'bg-background text-muted-foreground';

              return (
                <div
                  key={idx}
                  className={`flex items-start gap-3 px-3 py-0.5 ${rowClass}`}
                >
                  {/* Sign column */}
                  <span className="select-none w-3 shrink-0 text-center opacity-60">
                    {prefix}
                  </span>
                  {/* Line number */}
                  <span className="select-none shrink-0 w-8 text-right opacity-40 text-[10px]">
                    {idx + 1}
                  </span>
                  {/* Content */}
                  <span className="whitespace-pre break-all">{op.line}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
