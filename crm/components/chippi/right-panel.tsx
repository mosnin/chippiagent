'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_IN_OUT } from '@/lib/motion';
import { RightPanelTabs } from './right-panel-tabs';

interface RightPanelProps {
  slug: string;
  activeTab: 'people' | 'deals' | 'properties';
  onTabChange: (tab: 'people' | 'deals' | 'properties') => void;
  className?: string;
}

const TAB_PATHS: Record<RightPanelProps['activeTab'], (slug: string) => string> = {
  people: (slug) => `/s/${slug}/contacts`,
  deals: (slug) => `/s/${slug}/deals`,
  properties: (slug) => `/s/${slug}/properties`,
};

const TAB_LABELS: Record<RightPanelProps['activeTab'], string> = {
  people: 'People dashboard panel',
  deals: 'Deals dashboard panel',
  properties: 'Properties dashboard panel',
};

export function RightPanel({ slug, activeTab, onTabChange, className }: RightPanelProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
  }, [activeTab]);

  return (
    <motion.div
      className={cn(
        'flex flex-col h-full border-l border-border/70 bg-background overflow-hidden',
        className,
      )}
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_IN_OUT }}
    >
      <RightPanelTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-background">
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-lg bg-foreground/[0.04] animate-pulse"
                  style={{ width: `${85 - i * 8}%` }}
                />
              ))}
            </div>
          </div>
        )}
        <iframe
          key={activeTab}
          src={TAB_PATHS[activeTab](slug)}
          className="w-full h-full border-0"
          title={TAB_LABELS[activeTab]}
          aria-label={TAB_LABELS[activeTab]}
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </motion.div>
  );
}
