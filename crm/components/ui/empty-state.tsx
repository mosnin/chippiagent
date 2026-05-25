import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  /** Optional Lucide icon. Renders in a small tinted square above the title. */
  icon?: LucideIcon;
  /** One short narrative-voice headline. ("Inbox is clear", not "No items.") */
  title: string;
  /** One quiet sentence below the title. Optional. */
  description?: string;
  /** Single CTA — convenience shape. Pass `children` instead for multiple. */
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  /** Free slot for actions when `action` isn't enough (e.g. two buttons). */
  children?: React.ReactNode;
  /** Visual chrome. `card` = dashed bordered card, `flush` = no chrome. */
  variant?: 'card' | 'flush';
  /** Vertical scale. Most callers want md. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * EmptyState — one canonical surface for "nothing here yet" moments.
 *
 * Visual rules:
 *   - rounded-lg, matches the Card primitive (was rounded-xl/2xl across the
 *     product, drift fixed)
 *   - border-dashed border-border/70, paper-flat (no shadow)
 *   - bg-muted/20 — very subtle warm tint, not a hard contrast slab
 *   - icon in a 10x10 tinted square at size-16 stroke-1.75 (matches sidebar)
 *   - 13px description, max-w 280 so copy never reads as a banner
 *   - description in narrative voice; the caller should write copy that
 *     sets the tone of the page (Jobs lens — empty is the first impression)
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  variant = 'card',
  size = 'md',
  className,
}: EmptyStateProps) {
  const minHeight =
    size === 'sm' ? 'min-h-[140px]' : size === 'lg' ? 'min-h-[320px]' : 'min-h-[200px]';
  const padding = size === 'sm' ? 'py-8 px-4' : size === 'lg' ? 'py-16 px-8' : 'py-12 px-6';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        minHeight,
        padding,
        variant === 'card' && 'rounded-lg border border-dashed border-border/70 bg-muted/20',
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
          <Icon size={16} strokeWidth={1.75} className="text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-[13px] text-muted-foreground max-w-[280px] leading-relaxed">
          {description}
        </p>
      )}
      {(children || action) && (
        <div className="mt-4 flex gap-2 justify-center">
          {children}
          {action &&
            !children &&
            (action.href ? (
              <a href={action.href}>
                <Button variant="outline" size="sm">
                  {action.label}
                </Button>
              </a>
            ) : (
              <Button variant="outline" size="sm" onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
