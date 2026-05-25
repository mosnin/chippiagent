import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AgentGeneratedBadge({ className }: { className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[9px] font-medium text-orange-500 dark:text-orange-400 opacity-70',
      className,
    )}>
      <Bot size={8} />
      Chippi
    </span>
  );
}

export function AgentGeneratedBorder({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border-l-2 border-orange-400 dark:border-orange-500/60 pl-3', className)}>
      {children}
    </div>
  );
}
