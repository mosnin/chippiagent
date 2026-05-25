'use client';
import { useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface PanelResizeHandleProps {
  onResize: (newLeftWidthPercent: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Current left-panel width in percent (30–75). Used for keyboard resize steps. Defaults to 58. */
  currentLeftWidth?: number;
}

export function PanelResizeHandle({ onResize, containerRef, currentLeftWidth = 58 }: PanelResizeHandleProps) {
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    isDragging.current = true;
  }, []);

  useEffect(() => {
    const clamp = (value: number) => Math.max(30, Math.min(75, value));

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      onResize(clamp(pct));
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((touch.clientX - rect.left) / rect.width) * 100;
      onResize(clamp(pct));
    };

    const handleTouchEnd = () => {
      isDragging.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, onResize]);

  return (
    <div
      className={cn(
        'group relative flex-shrink-0 w-[4px] cursor-col-resize select-none',
        'bg-border/40 hover:bg-border/80 transition-colors duration-150',
        'flex items-center justify-center',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      )}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onResize(Math.max(30, currentLeftWidth - 2));
        if (e.key === 'ArrowRight') onResize(Math.min(75, currentLeftWidth + 2));
      }}
      tabIndex={0}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
    >
      {/* Grab handle indicator — appears on hover */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <GripVertical size={12} className="text-muted-foreground/70" />
      </div>
    </div>
  );
}
