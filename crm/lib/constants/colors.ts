export const LEAD_SCORE_COLORS = {
  hot: {
    badge: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    border: 'border-red-200 dark:border-red-500/25',
    text: 'text-red-600 dark:text-red-400',
    hex: '#b91c1c',
  },
  warm: {
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-500/25',
    text: 'text-amber-600 dark:text-amber-400',
    hex: '#a16207',
  },
  cold: {
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-500/25',
    text: 'text-blue-600 dark:text-blue-400',
    hex: '#1d4ed8',
  },
  unscored: {
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-500/25',
    text: 'text-slate-500 dark:text-slate-400',
    hex: '#94a3b8',
  },
} as const;

export const SUBSCRIPTION_STATUS_COLORS: Record<string, string> = {
  active: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  trialing: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  past_due: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  canceled: 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-500/15',
  unpaid: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
  inactive: 'text-slate-500 bg-slate-50 dark:text-slate-500 dark:bg-slate-500/10',
};
