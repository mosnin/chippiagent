import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      style={{ willChange: "opacity" }}
      {...props}
    />
  )
}

export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 flex items-center gap-4">
        <Skeleton className="h-3.5 w-32" />
        {cols > 1 && <Skeleton className="h-3.5 w-20 hidden sm:block" />}
        {cols > 2 && <Skeleton className="h-3.5 w-16 hidden md:block" />}
        {cols > 3 && <Skeleton className="h-5 w-14 rounded-full hidden lg:block" />}
      </div>
      <Skeleton className="h-5 w-12 rounded-full ml-auto" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

export function KPICardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-2">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export { Skeleton }
