'use client';

import { Users, Briefcase, Building2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

interface RightPanelTabsProps {
  activeTab: 'people' | 'deals' | 'properties';
  onTabChange: (tab: 'people' | 'deals' | 'properties') => void;
  className?: string;
}

const TABS = [
  { id: 'people' as const, label: 'People', icon: Users },
  { id: 'deals' as const, label: 'Deals', icon: Briefcase },
  { id: 'properties' as const, label: 'Properties', icon: Building2 },
];

export function RightPanelTabs({ activeTab, onTabChange, className }: RightPanelTabsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 px-3 py-2 border-b border-border/60',
        className,
      )}
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-label={`Switch to ${label} tab`}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'relative flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025]',
            )}
          >
            <Icon size={12} />
            {label}
            {isActive && (
              <motion.span
                layoutId="right-panel-tab-underline"
                className="absolute bottom-[-9px] left-2 right-2 h-[2px] rounded-full bg-foreground"
                transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
