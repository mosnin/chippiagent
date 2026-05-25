'use client';

export default function ContactsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center space-y-3 p-6">
        <h2 className="text-base font-semibold">Failed to load contacts</h2>
        <p className="text-sm text-muted-foreground">Please try again.</p>
        <button onClick={reset} className="text-sm text-primary font-medium hover:underline underline-offset-2">
          Retry
        </button>
      </div>
    </div>
  );
}
