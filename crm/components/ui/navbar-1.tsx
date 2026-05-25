"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  MessageCircle,
  Link2,
  Bot,
  Users,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const menuItems = [
  { name: "Home", href: "/" },
  { name: "Features", href: "/features" },
  { name: "Pricing", href: "/pricing" },
  { name: "FAQ", href: "/faq" },
];

const featureLinks = [
  {
    href: "/features/intake",
    icon: Link2,
    name: "Intake Link",
    description: "One link captures every renter inquiry",
  },
  {
    href: "/features/ai-scoring",
    icon: Bot,
    name: "AI Scoring",
    description: "Smart lead prioritization with context",
  },
  {
    href: "/features/crm",
    icon: Users,
    name: "Contacts",
    description: "Full profiles, history & follow-ups",
  },
  {
    href: "/features/pipeline",
    icon: TrendingUp,
    name: "Deal Pipeline",
    description: "Kanban stages, values & close dates",
  },
  {
    href: "/features/analytics",
    icon: BarChart3,
    name: "Analytics",
    description: "Conversion trends & pipeline health",
  },
];

export const Navbar1 = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMegaOpen, setIsMegaOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  const toggleMenu = () => setIsOpen(!isOpen);

  const openMega = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsMegaOpen(true);
  };

  const closeMegaDelayed = () => {
    closeTimerRef.current = setTimeout(() => setIsMegaOpen(false), 120);
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex justify-center px-4 pt-5">
      {/* Pill container */}
      <div className="relative flex items-center justify-between px-5 py-3 bg-background/95 backdrop-blur-md rounded-full border border-border shadow-lg shadow-amber-900/8 w-full max-w-3xl">
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.04 }}
          transition={{ duration: 0.3 }}
        >
          <Link href="/" aria-label="Chippi home" className="flex items-center">
            <BrandLogo className="h-6 w-auto" />
          </Link>
        </motion.div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {menuItems.map((item, i) => {
            const isFeatures = item.href === "/features";
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
                onMouseEnter={isFeatures ? openMega : undefined}
                onMouseLeave={isFeatures ? closeMegaDelayed : undefined}
              >
                {isFeatures ? (
                  <button
                    className={`flex items-center gap-0.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                      isActive
                        ? "text-primary bg-primary/8"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    onClick={() => (window.location.href = "/features")}
                  >
                    {item.name}
                    <motion.span
                      animate={{ rotate: isMegaOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown size={13} />
                    </motion.span>
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                      isActive
                        ? "text-primary bg-primary/8"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {item.name}
                  </Link>
                )}
              </motion.div>
            );
          })}
        </nav>

        {/* Desktop CTA */}
        <motion.div
          className="hidden md:block"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          whileHover={{ scale: 1.04 }}
        >
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center px-5 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-full hover:opacity-90 transition-opacity"
          >
            Start free trial
          </Link>
        </motion.div>

        {/* Mobile toggle */}
        <motion.button
          className="md:hidden flex items-center p-1.5 rounded-full hover:bg-muted transition-colors"
          onClick={toggleMenu}
          whileTap={{ scale: 0.9 }}
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          <Menu className="h-5 w-5 text-foreground" />
        </motion.button>

        {/* ── Mega menu drop-down ─────────────────────── */}
        <AnimatePresence>
          {isMegaOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+14px)] z-50 w-[560px]"
              onMouseEnter={openMega}
              onMouseLeave={closeMegaDelayed}
            >
              {/* Caret */}
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-background border-t border-l border-border" />

              <div className="rounded-2xl border border-border bg-background overflow-hidden shadow-xl shadow-amber-900/10">
                <div className="grid grid-cols-[1fr_190px]">
                  {/* Feature links */}
                  <div className="p-4 border-r border-border">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 mb-3">
                      Features
                    </p>
                    <div className="space-y-0.5">
                      {featureLinks.map((f) => (
                        <Link
                          key={f.href}
                          href={f.href}
                          onClick={() => setIsMegaOpen(false)}
                          className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted transition-colors"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                            <f.icon size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground leading-tight">
                              {f.name}
                            </p>
                            <p className="text-xs text-muted-foreground leading-snug mt-0.5 truncate">
                              {f.description}
                            </p>
                          </div>
                          <ArrowRight
                            size={12}
                            className="ml-auto text-transparent group-hover:text-muted-foreground flex-shrink-0 transition-colors"
                          />
                        </Link>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-border px-2">
                      <Link
                        href="/features"
                        onClick={() => setIsMegaOpen(false)}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 transition-opacity"
                      >
                        Browse all features <ArrowRight size={11} />
                      </Link>
                    </div>
                  </div>

                  {/* CTA panel */}
                  <div className="p-4 bg-muted/50 flex flex-col justify-between">
                    <div>
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-semibold mb-3">
                        <MessageCircle size={10} />
                        Free trial
                      </div>
                      <p className="text-sm font-semibold text-foreground leading-snug">
                        7 days free — no card required
                      </p>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
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

      {/* ── Mobile full-screen overlay ──────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-background z-50 pt-24 px-6 md:hidden overflow-y-auto"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <motion.button
              className="absolute top-6 right-6 p-2 rounded-full border border-border"
              onClick={toggleMenu}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              <X className="h-5 w-5 text-foreground" />
            </motion.button>

            <div className="flex flex-col space-y-5">
              {/* Top-level nav links */}
              {menuItems.map((item, i) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 + 0.1 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <Link
                    href={item.href}
                    className="text-base font-medium text-foreground hover:text-primary transition-colors"
                    onClick={toggleMenu}
                  >
                    {item.name}
                  </Link>
                </motion.div>
              ))}

              {/* Feature sub-links */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.42 }}
                exit={{ opacity: 0, x: 20 }}
                className="border-t border-border pt-5 space-y-2"
              >
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                  Features
                </p>
                {featureLinks.map((f) => (
                  <Link
                    key={f.href}
                    href={f.href}
                    onClick={toggleMenu}
                    className="flex items-center gap-3 py-1.5"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8 text-primary flex-shrink-0">
                      <f.icon size={13} />
                    </div>
                    <span className="text-sm font-medium text-foreground">{f.name}</span>
                  </Link>
                ))}
              </motion.div>

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.52 }}
                exit={{ opacity: 0, y: 16 }}
                className="pt-2"
              >
                <Link
                  href="/sign-up"
                  className="flex items-center justify-center w-full px-5 py-3 text-base font-semibold text-primary-foreground bg-primary rounded-full hover:opacity-90 transition-opacity"
                  onClick={toggleMenu}
                >
                  Start free trial
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
