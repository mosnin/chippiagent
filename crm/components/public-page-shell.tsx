import { BrandLogo } from '@/components/brand-logo';
import { safeHref } from '@/lib/utils';
import { BODY_MUTED, TITLE_FONT } from '@/lib/typography';

interface ShellCustomization {
  accentColor?: string;
  darkMode?: boolean;
  headerBgColor?: string | null;
  headerGradient?: string | null;
  font?: string;
  bio?: string | null;
  socialLinks?: Record<string, string> | null;
  footerLinks?: { label: string; url: string }[];
}

interface PublicPageShellProps {
  logoUrl: string | null;
  businessName: string;
  agentName: string;
  agentPhone: string | null;
  agentPhoto: string | null;
  pageTitle: string;
  pageIntro?: string;
  trustLine: string;
  /** Phrasing for the in-body "with [agent]" line (e.g. "Applying with", "Booking with"). Defaults to "with". */
  agentPresenceLabel?: string;
  /** Hide the "Powered by Chippi" mark — set on paid tiers (white-label). */
  hidePoweredBy?: boolean;
  customization?: ShellCustomization;
  children: React.ReactNode;
}

const FONT_CLASS_MAP: Record<string, string> = {
  system: '',
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
};

function SocialIcon({ platform }: { platform: string }) {
  const size = 13;
  switch (platform.toLowerCase()) {
    case 'linkedin':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      );
    case 'instagram':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
        </svg>
      );
    case 'facebook':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      );
    default:
      return null;
  }
}

export function PublicPageShell({
  logoUrl,
  businessName,
  agentName,
  agentPhone,
  agentPhoto,
  pageTitle,
  pageIntro,
  trustLine,
  agentPresenceLabel = 'with',
  hidePoweredBy = false,
  customization,
  children,
}: PublicPageShellProps) {
  const fontClass = FONT_CLASS_MAP[customization?.font || 'system'] || '';
  const darkClass = customization?.darkMode ? 'dark' : '';
  const accentColor = customization?.accentColor || '#ff964f';
  const hasSocial = customization?.socialLinks && Object.values(customization.socialLinks).some((v) => typeof v === 'string' && v.trim().length > 0);

  return (
    <div
      className={`min-h-screen bg-background text-foreground ${fontClass} ${darkClass}`.trim()}
      style={{ '--intake-accent': accentColor } as React.CSSProperties}
    >
      {/* ── Sticky hairline header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border/70">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          {/* Left: agent identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            {agentPhoto && (
              <img
                src={agentPhoto}
                alt={agentName}
                width={32}
                height={32}
                loading="eager"
                decoding="async"
                className="w-8 h-8 rounded-full object-cover ring-1 ring-border/70 flex-shrink-0"
              />
            )}
            <div className="min-w-0">
              {logoUrl ? (
                <img src={logoUrl} alt={businessName} width={100} height={24} loading="eager" decoding="async" className="h-5 sm:h-6 object-contain" />
              ) : (
                <span className="text-sm font-semibold text-foreground truncate block">{businessName}</span>
              )}
            </div>
          </div>

          {/* Right: social icons (if any) */}
          {hasSocial && (
            <div className="flex items-center gap-2">
              {Object.entries(customization!.socialLinks!).map(([platform, url]) =>
                url ? (
                  <a
                    key={platform}
                    href={safeHref(url as string)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground/40 hover:text-foreground transition-colors"
                    title={platform}
                  >
                    <SocialIcon platform={platform} />
                  </a>
                ) : null
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 pt-8 sm:pt-10">
        {/* Title + intro */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl tracking-tight text-foreground" style={TITLE_FONT}>
            {pageTitle}
          </h1>
          {pageIntro && (
            <p className="text-base text-muted-foreground mt-2 max-w-xl">{pageIntro}</p>
          )}
          {customization?.bio && (
            <p className="text-sm text-muted-foreground/80 mt-2 max-w-xl italic">{customization.bio}</p>
          )}
          {/* Trust line — sits with the intro, not buried in chrome */}
          <p className={`${BODY_MUTED} mt-3 max-w-xl`}>{trustLine}</p>

          {/* Agent presence — humanizes the form. Different role from the chrome avatar. */}
          {agentPhoto && agentName && (
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
              <img
                src={agentPhoto}
                alt={agentName}
                className="w-6 h-6 rounded-full object-cover ring-1 ring-border/70 flex-shrink-0"
              />
              <span>
                {agentPresenceLabel}{' '}
                <span className="font-medium text-foreground">{agentName}</span>
              </span>
            </div>
          )}
        </div>

        {/* Main form content */}
        {children}

        {/* ── In-flow footer ─────────────────────────────────────────────── */}
        <footer className="border-t border-border/60 mt-12 pt-6 pb-8 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground/70">
          {/* Left: legal links */}
          <div className="flex items-center gap-3">
            <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Terms</a>
            <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Privacy</a>
            {agentPhone && (
              <a href={`tel:${agentPhone}`} className="hover:text-foreground transition-colors">{agentPhone}</a>
            )}
          </div>

          {/* Center: realtor footer links or business name */}
          <div className="flex items-center gap-3">
            {customization?.footerLinks && customization.footerLinks.length > 0 ? (
              customization.footerLinks.slice(0, 2).map((link) => (
                <a
                  key={link.url}
                  href={safeHref(link.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors truncate max-w-[120px]"
                >
                  {link.label}
                </a>
              ))
            ) : (
              <span className="truncate">{businessName}</span>
            )}
          </div>

          {/* Right: Powered by Chippi — hidden on paid tiers (white-label) */}
          {!hidePoweredBy && (
            <div className="flex items-center gap-1 opacity-30">
              <span className="text-[10px] hidden sm:inline">Powered by</span>
              <BrandLogo className="h-3" />
            </div>
          )}
        </footer>
      </main>
    </div>
  );
}

/**
 * Minimal branded wrapper for secondary pages (status, tour manage).
 */
export function PublicPageMinimalShell({
  logoUrl,
  businessName,
  hidePoweredBy = false,
  children,
}: {
  logoUrl?: string | null;
  businessName: string;
  /** Hide the "Powered by Chippi" mark — set on paid tiers (white-label). */
  hidePoweredBy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border/70">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt={businessName} className="h-5 object-contain" />
            ) : (
              <span className="text-sm font-semibold text-foreground truncate">{businessName}</span>
            )}
          </div>
          {!hidePoweredBy && (
            <div className="flex items-center gap-1 flex-shrink-0 opacity-30">
              <span className="text-[10px] text-muted-foreground hidden sm:inline">Powered by</span>
              <BrandLogo className="h-3.5" />
            </div>
          )}
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        {children}
      </div>
    </div>
  );
}
