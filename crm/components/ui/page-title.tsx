import { cn } from '@/lib/utils';

interface PageTitleProps {
  /** Muted greeting line above the h1 — e.g. "Activity." with period. */
  label?: React.ReactNode;
  /** The page title — large serif, tracking-tight. */
  children: React.ReactNode;
  /** One-line muted status sentence below the title. Optional. */
  subtitle?: React.ReactNode;
  /** Right-aligned slot for actions (Run, Add, Filter, etc.). */
  actions?: React.ReactNode;
  className?: string;
}

export function PageTitle({ label, children, subtitle, actions, className }: PageTitleProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="space-y-1.5 min-w-0">
        {label && <p className="text-sm text-muted-foreground">{label}</p>}
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {children}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </header>
  );
}
