/**
 * Shared formatting utilities — single source of truth for the whole app.
 * Import from here instead of defining local copies in each file.
 */

/**
 * Returns a human-readable relative time string for a given date.
 * Handles Date objects, ISO strings, and numeric timestamps.
 */
export function timeAgo(date: Date | string | number): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Formats a number as standard USD currency (no cents).
 * e.g. 1500000 → "$1,500,000"
 */
export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Alias for formatCurrency — use in lead/contact money contexts. */
export const formatMoney = formatCurrency;

/**
 * Formats a number as compact USD for chart axes and tooltips.
 * e.g. 1500000 → "$1.5M", 15000 → "$15K"
 */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Returns up to 2 uppercase initials from a display name.
 * e.g. "Jane Doe" → "JD", "Alice" → "AL"
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

/**
 * Returns a human-friendly label for a follow-up date relative to today.
 * e.g. "Today", "Tomorrow", "In 3d", "2d overdue", "Mar 15"
 */
export function formatFollowUpDate(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const diffDays = Math.ceil(
    (d.getTime() - new Date(today.toDateString()).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays <= 7) return `In ${diffDays}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Converts a date to an HTML date-input value string ("YYYY-MM-DD").
 * Returns "" for null / invalid dates.
 */
export function toDateInputValue(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
