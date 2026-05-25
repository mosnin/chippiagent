/**
 * Theme-aware Clerk appearance config.
 * Most visual overrides are in globals.css (.cl-* selectors) — that file is
 * the source of truth for the paper-flat auth chrome. This config only sets
 * Clerk's variables (so its internal state colors line up) and layout choices.
 */
export function clerkAuthAppearance(isDark: boolean) {
  // Paper-flat primary — foreground, not orange. Matches PRIMARY_PILL.
  const primary = isDark ? '#f1f3f5' : '#1c1917';
  const foreground = isDark ? '#f1f3f5' : '#1c1917';

  return {
    variables: {
      colorPrimary: primary,
      colorNeutral: foreground,
      borderRadius: '0.375rem', // rounded-md
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      fontSize: '0.875rem',
    },
    layout: {
      socialButtonsPlacement: 'top' as const,
      socialButtonsVariant: 'blockButton' as const,
    },
    elements: {
      rootBox: 'w-full overflow-visible',
      card: 'shadow-none border-0 p-0 w-full gap-4 bg-transparent overflow-visible',
      cardBox: 'shadow-none border-0 bg-transparent overflow-visible',
      header: 'hidden',
      headerTitle: 'hidden',
      headerSubtitle: 'hidden',
      footer: 'hidden',
      footerAction: 'hidden',
    },
  } as const;
}
