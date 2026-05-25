'use client';

import { useState, useEffect, useCallback } from 'react';

export type RightPanelTab = 'people' | 'deals' | 'properties';

interface SplitPanelState {
  isSplit: boolean;
  rightTab: RightPanelTab;
  leftWidthPercent: number; // 0-100, default 58
}

const STORAGE_KEY = 'chippi-split-panel-v1';
const DEFAULTS: SplitPanelState = {
  isSplit: false,
  rightTab: 'people',
  leftWidthPercent: 58,
};

const MIN_WIDTH = 30;
const MAX_WIDTH = 75;

function clampWidth(pct: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, pct));
}

function loadFromStorage(): SplitPanelState {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function persistState(next: SplitPanelState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable (private browsing quota, etc.) — fail silently
  }
}

/**
 * Manages Chippi split-panel layout state, persisted in localStorage.
 *
 * - `isSplit` — whether the panel is in split view
 * - `toggle` — toggles between split and single view
 * - `rightTab` — active tab in the right panel ('people' | 'deals' | 'properties')
 * - `setRightTab` — sets the active right tab
 * - `leftWidthPercent` — left panel width as a percentage (clamped 30–75, default 58)
 * - `setLeftWidthPercent` — sets the left panel width (auto-clamped)
 *
 * @example
 * const { isSplit, toggle, rightTab, setRightTab, leftWidthPercent, setLeftWidthPercent } = useSplitPanel();
 */
export function useSplitPanel() {
  const [state, setState] = useState<SplitPanelState>(DEFAULTS);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setState(loadFromStorage());
  }, []);

  const updateState = useCallback((updates: Partial<SplitPanelState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      persistState(next);
      return next;
    });
  }, []);

  // Auto-disable split panel on narrow screens (< 768px / Tailwind's md breakpoint).
  useEffect(() => {
    const check = () => {
      if (window.innerWidth < 768 && state.isSplit) {
        updateState({ isSplit: false });
      }
    };
    check(); // run on mount
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [state.isSplit, updateState]);

  // Use functional setState to avoid stale closure on rapid toggles
  const toggle = useCallback(() => {
    setState(prev => {
      const next = { ...prev, isSplit: !prev.isSplit };
      persistState(next);
      return next;
    });
  }, []);

  const setRightTab = useCallback(
    (tab: RightPanelTab) => {
      updateState({ rightTab: tab });
    },
    [updateState],
  );

  const setLeftWidthPercent = useCallback(
    (pct: number) => {
      updateState({ leftWidthPercent: clampWidth(pct) });
    },
    [updateState],
  );

  return {
    isSplit: state.isSplit,
    toggle,
    rightTab: state.rightTab,
    setRightTab,
    leftWidthPercent: clampWidth(state.leftWidthPercent),
    setLeftWidthPercent,
  };
}
