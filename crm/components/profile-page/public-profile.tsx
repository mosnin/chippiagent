/**
 * The public realtor "link in bio" page rendered at /p/[slug].
 *
 * Layout: a single narrow column. A full-bleed header photo fades into the
 * page; identity and socials sit just below it. Then clearly separated,
 * labelled sections — the application (the conversion, in the realtor's
 * accent colour), tour booking, featured videos, listings, and links.
 *
 * On desktop the column becomes a centred card; on mobile it's full-bleed.
 * Branding (logo, accent colour, light/dark) is inherited from SpaceSetting
 * — the same fields the intake and booking pages use.
 *
 * Server component: every element is a link, nothing needs the client.
 */

import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, CalendarCheck, Globe, Link2, Play } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { cn, safeHref } from '@/lib/utils';
import { pickContrastColor } from '@/lib/color';
import { parseYouTubeId, youTubeThumbnail, faviconUrl } from '@/lib/profile-page';

export interface PublicProperty {
  id: string;
  address: string;
  city: string | null;
  stateRegion: string | null;
  listPrice: number | null;
  photos: string[] | null;
  listingUrl: string | null;
}

interface PublicVideo {
  id: string;
  url: string;
  title?: string;
}

interface PublicProfileProps {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  agentName: string;
  agentPhoto: string | null;
  bio: string | null;
  headline: string | null;
  socialLinks: Record<string, string> | null;
  accentColor: string;
  darkMode: boolean;
  showIntake: boolean;
  showTours: boolean;
  customLinks: Array<{ id: string; label: string; url: string; thumbnail?: string }>;
  videos: PublicVideo[];
  properties: PublicProperty[];
  hidePoweredBy: boolean;
}

function formatPrice(value: number | null): string | null {
  if (value == null || value <= 0) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Centred uppercase section heading — the divider between page sections. */
function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-center text-[13px] font-bold uppercase tracking-[0.12em] text-foreground">
      {children}
    </h2>
  );
}

/** Hand-rolled brand marks — lucide dropped brand icons. */
function SocialIcon({ platform }: { platform: string }) {
  const size = 15;
  switch (platform.toLowerCase()) {
    case 'linkedin':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    default:
      return <Globe size={size} aria-hidden />;
  }
}

/** The YouTube glyph for the video-card corner badge. */
function YouTubeMark() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#FF0000"
        d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z"
      />
      <path fill="#fff" d="M9.6 15.6 15.8 12 9.6 8.4Z" />
    </svg>
  );
}

function VideoCard({ video }: { video: PublicVideo }) {
  const videoId = parseYouTubeId(video.url);
  if (!videoId) return null;
  return (
    <a
      href={safeHref(video.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors hover:bg-muted/30"
    >
      <div className="relative">
        <img
          src={youTubeThumbnail(videoId)}
          alt={video.title || 'YouTube video'}
          loading="lazy"
          decoding="async"
          className="aspect-video w-full object-cover"
        />
        <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white">
          <YouTubeMark />
        </span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/20 transition-transform duration-150 group-hover:scale-105">
            <Play size={22} className="ml-0.5 text-white" fill="currentColor" />
          </span>
        </span>
      </div>
      {video.title && (
        <div className="px-4 py-3">
          <p className="truncate text-sm font-medium text-foreground">{video.title}</p>
        </div>
      )}
    </a>
  );
}

function PropertyCard({ property }: { property: PublicProperty }) {
  const cover = property.photos?.[0] ?? null;
  const locality = [property.city, property.stateRegion].filter(Boolean).join(', ');
  const price = formatPrice(property.listPrice);

  const inner = (
    <>
      {cover && (
        <img
          src={cover}
          alt={property.address}
          loading="lazy"
          decoding="async"
          className="aspect-[3/2] w-full object-cover"
        />
      )}
      <div className="px-4 py-3">
        <p className="truncate text-sm font-medium text-foreground">{property.address}</p>
        {locality && <p className="truncate text-xs text-muted-foreground">{locality}</p>}
        {price && (
          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{price}</p>
        )}
      </div>
    </>
  );

  if (property.listingUrl) {
    return (
      <a
        href={safeHref(property.listingUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors hover:bg-muted/30"
      >
        {inner}
      </a>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">{inner}</div>
  );
}

function LinkCard({
  link,
}: {
  link: { id: string; label: string; url: string; thumbnail?: string };
}) {
  // Uploaded image wins; otherwise fall back to the site's favicon.
  const icon =
    link.thumbnail && link.thumbnail.trim() ? link.thumbnail : faviconUrl(link.url);

  return (
    <a
      href={safeHref(link.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3 transition-colors hover:bg-muted/30"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-background">
        {icon ? (
          <img src={icon} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Link2 size={16} className="text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {link.label}
      </span>
      <ArrowUpRight
        size={16}
        className="shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      />
    </a>
  );
}

export function PublicProfile({
  slug,
  businessName,
  logoUrl,
  agentName,
  agentPhoto,
  bio,
  headline,
  socialLinks,
  accentColor,
  darkMode,
  showIntake,
  showTours,
  customLinks,
  videos,
  properties,
  hidePoweredBy,
}: PublicProfileProps) {
  const socialEntries = Object.entries(socialLinks ?? {}).filter(
    ([, url]) => typeof url === 'string' && url.trim().length > 0,
  );
  const playableVideos = videos.filter((v) => parseYouTubeId(v.url));
  const ctaTextColor = pickContrastColor(accentColor);

  return (
    <div className={cn('min-h-screen bg-muted/40', darkMode && 'dark')}>
      <div className="mx-auto w-full max-w-[480px] bg-background sm:my-8 sm:overflow-hidden sm:rounded-[28px] sm:border sm:border-border/60">
        {/* ── Header — full-bleed photo fading into the page ─────────────── */}
        <header>
          {agentPhoto && (
            <div className="relative">
              <img
                src={agentPhoto}
                alt={agentName}
                loading="eager"
                decoding="async"
                className="aspect-[4/5] w-full object-cover object-top"
              />
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-background"
              />
            </div>
          )}

          <div
            className={cn(
              'relative px-6 text-center',
              agentPhoto ? '-mt-14' : 'pt-12',
            )}
          >
            <h1>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={businessName}
                  loading="eager"
                  decoding="async"
                  className="mx-auto h-9 max-w-[240px] object-contain"
                />
              ) : (
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  {businessName}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">@{slug}</p>
            {headline && (
              <p className="mt-2 text-sm text-foreground">{headline}</p>
            )}

            {socialEntries.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {socialEntries.map(([platform, url]) => (
                  <a
                    key={platform}
                    href={safeHref(url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={platform}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                  >
                    <SocialIcon platform={platform} />
                  </a>
                ))}
              </div>
            )}

            {bio && (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{bio}</p>
            )}
          </div>
        </header>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="px-6 pb-10">
          {/* Primary actions */}
          {(showIntake || showTours) && (
            <div className="mt-7 space-y-3">
              {showIntake && (
                <a
                  href={`/apply/${slug}`}
                  style={{ backgroundColor: accentColor, color: ctaTextColor }}
                  className="group flex items-center gap-3 rounded-2xl px-5 py-4 transition-transform duration-150 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Start your application</p>
                    <p className="truncate text-xs opacity-75">
                      A few quick questions about what you&apos;re looking for.
                    </p>
                  </div>
                  <ArrowRight
                    size={18}
                    className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                </a>
              )}
              {showTours && (
                <a
                  href={`/book/${slug}`}
                  className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 transition-colors hover:bg-muted/30"
                >
                  <CalendarCheck size={18} className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Book a tour</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Pick a time that works for you.
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                </a>
              )}
            </div>
          )}

          {/* Watch */}
          {playableVideos.length > 0 && (
            <section className="mt-10 space-y-4">
              <SectionHeader>Watch</SectionHeader>
              <div className="space-y-3">
                {playableVideos.map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
            </section>
          )}

          {/* Listings */}
          {properties.length > 0 && (
            <section className="mt-10 space-y-4">
              <SectionHeader>Listings</SectionHeader>
              <div className="space-y-3">
                {properties.map((p) => (
                  <PropertyCard key={p.id} property={p} />
                ))}
              </div>
            </section>
          )}

          {/* Links */}
          {customLinks.length > 0 && (
            <section className="mt-10 space-y-4">
              <SectionHeader>Links</SectionHeader>
              <div className="space-y-3">
                {customLinks.map((link) => (
                  <LinkCard key={link.id} link={link} />
                ))}
              </div>
            </section>
          )}

          {/* Powered by Chippi — free tier only; paid plans are white-label. */}
          {!hidePoweredBy && (
            <footer className="mt-12 flex items-center justify-center gap-1.5 opacity-40">
              <span className="text-[10px] text-muted-foreground">Powered by</span>
              <BrandLogo className="h-3" />
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
