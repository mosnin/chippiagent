export default function ContactsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-muted rounded-lg" />
        <div className="h-9 w-28 bg-muted rounded-lg" />
      </div>
      <div className="flex gap-3">
        <div className="h-9 flex-1 bg-muted rounded-lg" />
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
