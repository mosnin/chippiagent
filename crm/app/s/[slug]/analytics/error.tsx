'use client';

export default function AnalyticsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center space-y-3">
      <p
        className="text-3xl tracking-tight text-foreground"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        Failed to load analytics
      </p>
      <p className="text-sm text-muted-foreground">Please try again.</p>
      <button
        onClick={reset}
        className="bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] rounded-full px-4 h-9 gap-1.5 inline-flex items-center transition-all duration-150 text-sm"
      >
        Retry
      </button>
    </div>
  );
}
