export default function AnalyticsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-background p-5">
            <div className="h-7 w-16 bg-foreground/[0.06] rounded" />
            <div className="h-3 w-20 bg-foreground/[0.06] rounded mt-3" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border/70 bg-background p-5">
          <div className="h-4 w-32 bg-foreground/[0.06] rounded" />
          <div className="h-3 w-48 bg-foreground/[0.06] rounded mt-2" />
          <div className="h-[200px] bg-foreground/[0.04] rounded mt-4" />
        </div>
        <div className="rounded-xl border border-border/70 bg-background p-5">
          <div className="h-4 w-32 bg-foreground/[0.06] rounded" />
          <div className="h-3 w-48 bg-foreground/[0.06] rounded mt-2" />
          <div className="h-[200px] bg-foreground/[0.04] rounded mt-4" />
        </div>
      </div>
    </div>
  );
}
