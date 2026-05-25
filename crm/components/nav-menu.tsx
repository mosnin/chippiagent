'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Link2,
  Bot,
  Users,
  TrendingUp,
  BarChart3,
  ArrowRight,
  ChevronDown,
  MessageCircle,
} from 'lucide-react';

import { navLinks } from '@/lib/nav-links';

interface NavItem {
  id: number;
  name: string;
  href: string;
}

const navs: NavItem[] = [...navLinks];

const featureLinks = [
  {
    href: '/features/intake',
    icon: Link2,
    name: 'Intake Link',
    description: 'One link captures every renter inquiry',
  },
  {
    href: '/features/ai-scoring',
    icon: Bot,
    name: 'AI Scoring',
    description: 'Smart lead prioritization with context',
  },
  {
    href: '/features/crm',
    icon: Users,
    name: 'Contacts',
    description: 'Full profiles, history & follow-ups',
  },
  {
    href: '/features/pipeline',
    icon: TrendingUp,
    name: 'Deal Pipeline',
    description: 'Kanban stages, values & close dates',
  },
  {
    href: '/features/analytics',
    icon: BarChart3,
    name: 'Analytics',
    description: 'Conversion trends & pipeline health',
  },
];

export function NavMenu() {
  const ref = useRef<HTMLUListElement>(null);
  const pathname = usePathname();
  const [left, setLeft] = useState(0);
  const [width, setWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isMegaOpen, setIsMegaOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeHref = navs.find((n) => {
    if (n.href === '/') return pathname === '/';
    return pathname.startsWith(n.href);
  })?.href ?? '/';

  useEffect(() => {
    const activeItem = ref.current?.querySelector<HTMLElement>(
      `[data-href="${activeHref}"]`
    )?.parentElement;
    if (activeItem) {
      setLeft(activeItem.offsetLeft);
      setWidth(activeItem.getBoundingClientRect().width);
      setIsReady(true);
    }
  }, [activeHref]);

  const openMega = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsMegaOpen(true);
  };

  const closeMegaDelayed = () => {
    closeTimerRef.current = setTimeout(() => setIsMegaOpen(false), 120);
  };

  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  return (
    <div className="hidden w-full md:block relative">
      <ul
        className="relative mx-auto flex h-11 w-fit items-center justify-center rounded-full px-2"
        ref={ref}
      >
        {navs.map((item) => {
          const isFeatures = item.href === '/features';
          return (
            <li
              key={item.id}
              className={`tracking-tight z-10 flex h-full cursor-pointer items-center justify-center px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                activeHref === item.href ? 'text-primary' : 'text-primary/60 hover:text-primary'
              }`}
              onMouseEnter={isFeatures ? openMega : undefined}
              onMouseLeave={isFeatures ? closeMegaDelayed : undefined}
            >
              {isFeatures ? (
                <button
                  data-href={item.href}
                  className="flex items-center gap-1"
                  onClick={() => window.location.href = '/features'}
                >
                  {item.name}
                  <motion.span
                    animate={{ rotate: isMegaOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={13} className="opacity-70" />
                  </motion.span>
                </button>
              ) : (
                <Link href={item.href} data-href={item.href}>
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
        {isReady && (
          <motion.li
            animate={{ left, width }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-accent/60 border-border absolute inset-0 my-1.5 rounded-full border"
          />
        )}
      </ul>

      {/* Mega menu panel */}
      <AnimatePresence>
        {isMegaOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+14px)] z-50 w-[580px]"
            onMouseEnter={openMega}
            onMouseLeave={closeMegaDelayed}
          >
            {/* Arrow */}
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-background border-t border-l border-border" />

            <div className="rounded-2xl border border-border bg-background shadow-[0_8px_40px_-8px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.45)] overflow-hidden">
              <div className="grid grid-cols-[1fr_200px]">
                {/* Left: feature links */}
                <div className="p-4 border-r border-border">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-2 mb-3">
                    Features
                  </p>
                  <div className="space-y-0.5">
                    {featureLinks.map((f) => (
                      <Link
                        key={f.href}
                        href={f.href}
                        onClick={() => setIsMegaOpen(false)}
                        className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                          <f.icon size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground leading-tight">{f.name}</p>
                          <p className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">{f.description}</p>
                        </div>
                        <ArrowRight size={13} className="ml-auto text-muted-foreground/0 group-hover:text-muted-foreground flex-shrink-0 transition-colors" />
                      </Link>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border px-2">
                    <Link
                      href="/features"
                      onClick={() => setIsMegaOpen(false)}
                      className="flex items-center gap-1.5 text-xs text-primary font-medium hover:opacity-80 transition-opacity"
                    >
                      Browse all features <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>

                {/* Right: CTA panel */}
                <div className="p-4 bg-muted/40 flex flex-col justify-between">
                  <div>
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-semibold mb-3">
                      <MessageCircle size={10} />
                      Free trial
                    </div>
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      7 days free — no card required
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Get your intake link live in minutes.
                    </p>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Link
                      href="/sign-up"
                      onClick={() => setIsMegaOpen(false)}
                      className="flex w-full items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-full py-2 text-xs font-semibold hover:opacity-90 transition-opacity"
                    >
                      Start free trial <ArrowRight size={11} />
                    </Link>
                    <Link
                      href="/pricing"
                      onClick={() => setIsMegaOpen(false)}
                      className="flex w-full items-center justify-center gap-1.5 border border-border bg-background rounded-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View pricing
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
