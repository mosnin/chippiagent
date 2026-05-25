'use client';

// Deterministic widths keyed by row index — avoids hydration mismatch from Math.random().
const ROW_WIDTHS = ['75%', '55%', '90%', '65%', '80%'];

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-3.5 bg-muted rounded w-24 flex-shrink-0" />
          <div
            className="h-3.5 bg-muted/60 rounded flex-1"
            style={{ maxWidth: ROW_WIDTHS[i % ROW_WIDTHS.length] }}
          />
        </div>
      ))}
    </div>
  );
}
