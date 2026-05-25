export default function ContactDetailLoading() {
  return (
    <div className="max-w-4xl space-y-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-muted rounded-lg" />
        <div className="h-4 w-40 bg-muted rounded-lg" />
      </div>
      <div className="h-48 bg-muted rounded-lg" />
      <div className="h-64 bg-muted rounded-lg" />
      <div className="h-80 bg-muted rounded-lg" />
    </div>
  );
}
