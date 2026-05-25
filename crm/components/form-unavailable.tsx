import { AlertCircle } from 'lucide-react';

/**
 * Shown on public intake / booking pages when the realtor's subscription
 * is not active (i.e. stripeSubscriptionStatus is neither 'active' nor 'trialing').
 *
 * This is a server component — no client JS required.
 */
export function FormUnavailable({ agentName }: { agentName: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="mx-auto max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center shadow-sm space-y-4">
        <div className="flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            This form is currently unavailable
          </h1>
          <p className="text-muted-foreground">
            Please contact {agentName} directly.
          </p>
        </div>
      </div>
    </div>
  );
}
