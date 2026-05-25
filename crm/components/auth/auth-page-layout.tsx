'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Globe } from '@/components/ui/cobe-globe';
import { BODY_MUTED, CAPTION, H1, TITLE_FONT } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT, PAGE_VARIANTS } from '@/lib/motion';
import { useTheme } from '@/components/theme-provider';

const leadMarkers = [
  { id: "hot-lead", location: [40.7, -74.0] as [number, number], label: "Hot Lead" },
  { id: "new-renter", location: [51.5, -0.13] as [number, number], label: "New Renter" },
  { id: "pre-approved", location: [35.68, 139.65] as [number, number], label: "Pre-approved" },
  { id: "tour-booked", location: [-33.87, 151.21] as [number, number], label: "Tour Booked" },
  { id: "buyer-lead", location: [-23.55, -46.63] as [number, number], label: "Buyer Lead" },
  { id: "warm-lead", location: [25.2, 55.27] as [number, number], label: "Warm Lead" },
];

const leadArcs = [
  { id: "nyc-london", from: [40.7, -74.0] as [number, number], to: [51.5, -0.13] as [number, number] },
  { id: "london-tokyo", from: [51.5, -0.13] as [number, number], to: [35.68, 139.65] as [number, number] },
  { id: "nyc-saopaulo", from: [40.7, -74.0] as [number, number], to: [-23.55, -46.63] as [number, number] },
];

// Right-panel variant: same fade as PAGE_VARIANTS but delayed 100ms so the
// form lands first, then the brand promise settles in. Stagger feels intentional.
const RIGHT_PANEL_VARIANTS = {
  initial: { opacity: 0, y: 4 },
  enter: { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT, delay: 0.1 } },
} as const;

// ═════════════════════════════════════════════════════════════════════════════

export interface AuthPageLayoutProps {
  children: React.ReactNode;
  heading: string;
  subheading?: string;
  variant?: 'realtor' | 'broker';
}

export function AuthPageLayout({ children, heading, subheading, variant: _variant }: AuthPageLayoutProps) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const isBrokerLogin = pathname.startsWith('/login/broker');
  const isRealtorLogin = pathname.startsWith('/login/realtor');
  const isLoginPage = isBrokerLogin || isRealtorLogin;
  const showRoleSwitcher = isLoginPage;

  return (
    <main className="relative min-h-screen bg-background lg:flex lg:h-screen lg:overflow-y-auto lg:overflow-x-hidden">

      {/* ── Left form panel ── */}
      <div className="relative flex w-full min-h-screen flex-col bg-background px-6 py-6 sm:px-10 sm:py-8 lg:min-h-0 lg:w-[480px] lg:min-w-[480px] lg:overflow-y-auto lg:border-r lg:border-border/70 lg:py-10">

        {/* Logo */}
        <div className="shrink-0">
          <BrandLogo className="h-6 sm:h-7" alt="Chippi" />
        </div>

        {/* Form area */}
        <div className="flex flex-1 flex-col justify-center py-6 sm:py-8 lg:py-0">
          <motion.div
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="enter"
            className="mx-auto w-full max-w-[380px]"
          >

            {/* Role switcher — fully rounded, paper-flat */}
            {showRoleSwitcher && (
              <div role="tablist" aria-label="Account type" className="mb-6 flex rounded-full bg-foreground/[0.04] p-1">
                <Link
                  href="/login/realtor"
                  role="tab"
                  aria-selected={isRealtorLogin}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-all sm:py-2',
                    isRealtorLogin
                      ? 'bg-background border border-border/70 text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <User size={16} className="shrink-0 sm:size-[14px]" />
                  Realtor
                </Link>
                <Link
                  href="/login/broker"
                  role="tab"
                  aria-selected={isBrokerLogin}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-all sm:py-2',
                    isBrokerLogin
                      ? 'bg-background border border-border/70 text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Building2 size={16} className="shrink-0 sm:size-[14px]" />
                  Broker
                </Link>
              </div>
            )}

            {/* Heading — serif Times, the screen's headline */}
            {heading && (
              <div className="mb-6 space-y-1.5">
                <h1 className={H1} style={TITLE_FONT}>
                  {heading}
                </h1>
                {subheading && (
                  <p className={BODY_MUTED}>{subheading}</p>
                )}
              </div>
            )}

            <div className="w-full">
              {children}
            </div>
          </motion.div>
        </div>

        {/* ToS / Privacy */}
        <p className={cn(CAPTION, 'shrink-0 pt-4 text-center leading-relaxed sm:text-left')}>
          By continuing, you agree to our{' '}
          <Link href="/legal/terms" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      {/* ── Right decorative panel ── */}
      <div className="hidden lg:relative lg:flex lg:flex-1 lg:flex-col lg:items-center lg:justify-center overflow-hidden">

        {/* Brand-warm wash — same as the realtor sidebar top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-orange-50/60 via-orange-50/20 to-transparent dark:from-orange-500/[0.04] dark:via-transparent" />

        <motion.div
          variants={RIGHT_PANEL_VARIANTS}
          initial="initial"
          animate="enter"
          className="relative z-10 flex w-full flex-col items-center"
        >
          {/* Brand promise — serif Times, two-line treatment */}
          <div className="text-center px-8 -mt-8">
            <p style={TITLE_FONT} className="text-3xl tracking-tight text-foreground">
              I keep your day moving
            </p>
            <p style={TITLE_FONT} className="text-2xl tracking-tight text-muted-foreground">
              so you don&apos;t have to.
            </p>
          </div>

          {/* Globe — orange markers, premium dimensional flourish.
              Theme-aware: dark mode uses a near-black base + dimmer glow so
              the white sphere doesn't bloom against the dark backdrop. */}
          <div className="w-full max-w-[480px] mt-2">
            <Globe
              markers={leadMarkers}
              arcs={leadArcs}
              markerColor={[1, 0.59, 0.31]}
              baseColor={isDark ? [0.09, 0.09, 0.1] : [1, 1, 1]}
              arcColor={[1, 0.59, 0.31]}
              glowColor={isDark ? [0.18, 0.18, 0.2] : [0.94, 0.93, 0.91]}
              dark={isDark ? 1 : 0}
              mapBrightness={isDark ? 6 : 10}
              markerSize={0.025}
              markerElevation={0.01}
            />
          </div>
        </motion.div>
      </div>
    </main>
  );
}
