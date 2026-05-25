'use client';

/**
 * IntakeChatShell — bespoke layout for the public intake chat surface.
 *
 * The generic PublicPageShell carries form-page furniture (page title,
 * intro paragraph, trust line, "Applying with X" band, footer columns)
 * that competes with the chat for attention. The intake chat doesn't
 * need any of it — the realtor's presence is the brand, the chat is
 * the content, the footer is small print.
 *
 * What this renders:
 *   - Top: realtor photo + name + optional secondary line (brokerage).
 *     ONE appearance. No business-name repetition. No "Applying with"
 *     duplicate band. A hairline divider closes the header.
 *   - Middle: a max-w-2xl column that the chat fills.
 *   - Bottom: an almost-invisible footer (Terms / Privacy / "Powered by
 *     Chippi"). Stays out of the way unless the lead looks for it.
 *
 * The shell makes no decisions about chat behaviour — children render
 * whatever the chat state machine produces.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { BrandLogo } from '@/components/brand-logo';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { safeHref, cn } from '@/lib/utils';

export interface IntakeChatShellProps {
  agentName: string;
  agentPhoto?: string | null;
  /** Optional secondary line under the agent's name. Use the brokerage
   *  or business name only when it adds context — duplicating the agent
   *  name (or the slug) here is the failure mode this shell is fixing. */
  secondaryLabel?: string | null;
  accentColor?: string;
  privacyPolicyUrl?: string | null;
  termsUrl?: string | null;
  hidePoweredBy?: boolean;
  footerLinks?: { label: string; url: string }[];
  /** Realtor/brokerage-supplied trust signals. Chippi never injects
   *  legal copy — the slots are optional and the block disappears
   *  entirely when none are provided. */
  licenseNumber?: string | null;
  fairHousingNotice?: string | null;
  showEqualHousingMark?: boolean;
  children: ReactNode;
}

/** Standard Equal Housing Opportunity mark — house silhouette with an
 *  equals sign. Rendered as inline SVG so it inherits text color and
 *  scales cleanly at ~14px. Pure presentation, no remote assets. */
function EqualHousingMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label="Equal Housing Opportunity"
      role="img"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* House silhouette */}
      <path d="M3 11 L12 3 L21 11 V21 H3 Z" />
      {/* Equals sign inside */}
      <line x1="8" y1="13.5" x2="16" y2="13.5" />
      <line x1="8" y1="16.5" x2="16" y2="16.5" />
    </svg>
  );
}

/** First two initials from a name. Falls back to a single dot when empty. */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function IntakeChatShell({
  agentName,
  agentPhoto,
  secondaryLabel,
  accentColor,
  privacyPolicyUrl,
  termsUrl,
  hidePoweredBy,
  footerLinks,
  licenseNumber,
  fairHousingNotice,
  showEqualHousingMark,
  children,
}: IntakeChatShellProps) {
  // The trust block is entirely optional. If the realtor hasn't supplied
  // any of these three, render nothing — no hairline, no empty space.
  const trustedLicense = licenseNumber?.trim() || '';
  const trustedNotice = fairHousingNotice?.trim() || '';
  const hasTrustBlock = Boolean(
    trustedLicense || trustedNotice || showEqualHousingMark,
  );
  // If the secondary label is just the agent name again (the common
  // "businessName === agentName" case), drop it. Repetition is the
  // exact thing this shell exists to prevent.
  const showSecondary =
    secondaryLabel && secondaryLabel.trim().length > 0 && secondaryLabel !== agentName;

  // Soft accent-tinted gradient background — the previous "plain white
  // slab" failure mode this shell was rebuilt to fix. The gradient is
  // subtle (max 14% opacity) so it never competes with the chat content,
  // but it's visible enough that the page reads as a designed surface
  // rather than a default form.
  const gradientStyle = {
    backgroundImage: `radial-gradient(ellipse 90% 60% at 50% 0%, ${withAlpha(
      accentColor || '#0c0c0d',
      0.14,
    )} 0%, transparent 65%)`,
  } as React.CSSProperties;

  return (
    <div className="relative h-dvh min-h-[600px] flex flex-col text-foreground overflow-hidden bg-background">
      {/* Background gradient — sits below everything. The dot grid texture
          adds craft: a 1px @ 0.04 opacity pattern that reads as paper, not
          screen. Both layers are absolute so the flex layout above
          remains correct. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
        style={gradientStyle}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none opacity-[0.045] dark:opacity-[0.08]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* ── Sticky header — realtor presence pinned at the top ──────── */}
      <motion.header
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
        className="flex-shrink-0 w-full bg-background/70 backdrop-blur-xl border-b border-border/40"
      >
        <div className="max-w-2xl mx-auto px-5 sm:px-8 py-4 sm:py-5">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              {agentPhoto ? (
                // Real photo wins every time it's available. The fallback
                // initials only fire when the realtor hasn't uploaded one.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={agentPhoto}
                  alt={agentName}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover ring-2 ring-background"
                  style={{ boxShadow: `0 0 0 1px ${withAlpha(accentColor || '#0c0c0d', 0.2)}` }}
                />
              ) : (
                <span
                  aria-hidden
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full inline-flex items-center justify-center text-base sm:text-lg font-semibold text-white select-none ring-2 ring-background"
                  style={{
                    backgroundColor: accentColor || '#0c0c0d',
                    boxShadow: `0 0 0 1px ${withAlpha(accentColor || '#0c0c0d', 0.3)}`,
                  }}
                >
                  {deriveInitials(agentName)}
                </span>
              )}
              {/* Presence dot — subtle "available" signal in the realtor's
                  accent color. Doesn't pulse (that would feel anxious);
                  just sits there steadily. */}
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-background"
                style={{ backgroundColor: '#10b981' }}
                title="Available"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] sm:text-[17px] font-semibold text-foreground leading-tight truncate">
                {agentName}
              </p>
              {showSecondary && (
                <p className="mt-0.5 text-[12px] sm:text-[13px] text-muted-foreground truncate">
                  {secondaryLabel}
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* ── Main — scrollable chat with edge-fade masks ─────────────── */}
      <main className="flex-1 w-full min-h-0 relative">
        {/* Top edge-fade so content scrolls into the sticky header without
            a hard cutoff. -mb negative pulls the next element up so the
            visual rhythm doesn't gain extra space. */}
        <div
          aria-hidden
          className="sticky top-0 z-10 h-6 -mb-6 bg-gradient-to-b from-background to-transparent pointer-events-none"
        />
        <div className="h-full overflow-y-auto scroll-smooth">
          <div className="max-w-2xl mx-auto px-5 sm:px-8 py-8 pb-12">
            {children}
          </div>
        </div>
        {/* Bottom edge-fade — the same trick on the other end. Content
            scrolls into the sticky footer without abrupt clipping. */}
        <div
          aria-hidden
          className="sticky bottom-0 z-10 h-8 -mt-8 bg-gradient-to-t from-background to-transparent pointer-events-none"
        />
      </main>

      {/* ── Sticky footer — small print pinned at the bottom ────────── */}
      <footer className="flex-shrink-0 w-full bg-background/70 backdrop-blur-xl border-t border-border/40">
        <div className="max-w-2xl mx-auto px-5 sm:px-8 py-3 sm:py-4">
          {/* Trust signals — only renders when the realtor supplies content.
              Sits above the Terms/Privacy/PoweredBy row, separated by a
              hairline. Paper-flat: text + rule, no chrome. */}
          {hasTrustBlock && (
            <div className="mb-3 pb-3 border-b border-border/40 text-[11px] text-muted-foreground/80 space-y-1.5">
              {showEqualHousingMark && (
                <div>
                  <EqualHousingMark className="h-3.5 w-3.5 text-muted-foreground/70" />
                </div>
              )}
              {trustedLicense && <div>{trustedLicense}</div>}
              {trustedNotice && (
                <div className="whitespace-pre-line">{trustedNotice}</div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 text-[11px] text-muted-foreground/70">
            <div className="flex items-center gap-4">
              {termsUrl && (
                <Link
                  href={safeHref(termsUrl)}
                  className="hover:text-foreground transition-colors"
                >
                  Terms
                </Link>
              )}
              {privacyPolicyUrl && (
                <Link
                  href={safeHref(privacyPolicyUrl)}
                  className="hover:text-foreground transition-colors"
                >
                  Privacy
                </Link>
              )}
              {(footerLinks ?? []).map((l) => (
                <Link
                  key={l.url}
                  href={safeHref(l.url)}
                  className="hover:text-foreground transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </div>
            {!hidePoweredBy && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-muted-foreground/60',
                )}
              >
                Powered by <BrandLogo className="h-3 opacity-70" />
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Add an alpha channel to a hex/rgb-style color string. Returns the
 * input untouched if the format isn't recognized (so the realtor's
 * arbitrary `intakeAccentColor` value never crashes the page).
 */
function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  // #RGB / #RRGGBB
  const hexMatch = color.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  // rgb(...) / rgba(...) — swap the alpha
  if (color.startsWith('rgb')) {
    const nums = color.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${a})`;
    }
  }
  return color;
}
