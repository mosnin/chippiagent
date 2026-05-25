export default function LeadsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-7 w-24 bg-muted rounded-lg" />
          <div className="h-4 w-64 bg-muted rounded-lg" />
        </div>
      </div>
      <div className="h-12 bg-muted rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  );
}
