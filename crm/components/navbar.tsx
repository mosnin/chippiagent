'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ChevronDown, Link2, Bot, Users, TrendingUp, BarChart3 } from 'lucide-react';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { AnimatePresence, motion, useScroll } from 'motion/react';

import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { NavMenu } from '@/components/nav-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { navLinks } from '@/lib/nav-links';

const INITIAL_WIDTH = '70rem';
const MAX_WIDTH = '800px';

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

const drawerVariants = {
  hidden: { opacity: 0, y: 100 },
  visible: {
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: {
      type: 'spring' as const,
      damping: 15,
      stiffness: 200,
      staggerChildren: 0.03
    }
  },
  exit: {
    opacity: 0,
    y: 100,
    transition: { duration: 0.1 }
  }
};

const drawerMenuContainerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 }
};

const drawerMenuVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 }
};

const drawerFeatureLinks = [
  { href: '/features/intake', icon: Link2, name: 'Intake Link' },
  { href: '/features/ai-scoring', icon: Bot, name: 'AI Scoring' },
  { href: '/features/crm', icon: Users, name: 'Contacts' },
  { href: '/features/pipeline', icon: TrendingUp, name: 'Deal Pipeline' },
  { href: '/features/analytics', icon: BarChart3, name: 'Analytics' },
];

export function Navbar() {
  const { scrollY } = useScroll();
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [featuresExpanded, setFeaturesExpanded] = useState(false);
  const pathname = usePathname();

  const activeHref = navLinks.find((n) => {
    if (n.href === '/') return pathname === '/';
    return pathname.startsWith(n.href);
  })?.href ?? '/';

  useEffect(() => {
    const unsubscribe = scrollY.on('change', (latest) => {
      setHasScrolled(latest > 10);
    });
    return unsubscribe;
  }, [scrollY]);

  const toggleDrawer = () => setIsDrawerOpen((prev) => !prev);
  const handleOverlayClick = () => setIsDrawerOpen(false);

  return (
    <header
      className={cn(
        'fixed inset-x-0 z-50 mx-4 flex justify-center transition-all duration-300 md:mx-0',
        hasScrolled ? 'top-6' : 'top-4 mx-0'
      )}
    >
      <motion.div
        initial={{ width: INITIAL_WIDTH }}
        animate={{ width: hasScrolled ? MAX_WIDTH : INITIAL_WIDTH }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div
          className={cn(
            'mx-auto max-w-7xl rounded-2xl transition-all duration-300 xl:px-0',
            hasScrolled
              ? 'border-border bg-background/75 border px-2 backdrop-blur-lg'
              : 'px-7 shadow-none'
          )}
        >
          <div className="flex h-[56px] items-center justify-between p-4">
            <Link href="/" className="flex items-center gap-3" aria-label="Chippi home">
              <BrandLogo className="h-6 w-auto" alt="Chippi" />
            </Link>

            <NavMenu />

            <div className="flex shrink-0 flex-row items-center gap-1 md:gap-3">
              <div className="flex items-center space-x-2">
                <Link
                  className="hidden h-8 w-fit items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground md:flex"
                  href="/login/realtor"
                >
                  Log in
                </Link>
              </div>
              <ThemeToggle />
              <button
                className="border-border flex size-8 cursor-pointer items-center justify-center rounded-md border md:hidden"
                onClick={toggleDrawer}
                aria-label={isDrawerOpen ? 'Close menu' : 'Open menu'}
              >
                <MenuToggleIcon open={isDrawerOpen} className="size-5" duration={400} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={overlayVariants}
              transition={{ duration: 0.2 }}
              onClick={handleOverlayClick}
            />

            <motion.div
              className="bg-background border-border fixed inset-x-0 bottom-3 mx-auto w-[95%] rounded-xl border p-4 shadow-lg"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={drawerVariants}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <Link href="/" className="flex items-center gap-3" aria-label="Chippi home">
                    <BrandLogo className="h-6 w-auto" alt="Chippi" />
                  </Link>
                  <button
                    onClick={toggleDrawer}
                    className="border-border cursor-pointer rounded-md border p-1"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <motion.ul
                  className="border-border mb-4 flex flex-col rounded-md border text-sm"
                  variants={drawerMenuContainerVariants}
                >
                  <AnimatePresence>
                    {navLinks.map((item) => {
                      const isFeatures = item.href === '/features';
                      return (
                        <motion.li
                          key={item.id}
                          className="border-border border-b last:border-b-0"
                          variants={drawerMenuVariants}
                        >
                          {isFeatures ? (
                            <div>
                              <button
                                onClick={() => setFeaturesExpanded((v) => !v)}
                                className={`flex w-full items-center justify-between p-2.5 transition-colors ${
                                  pathname.startsWith('/features')
                                    ? 'text-primary font-medium'
                                    : 'text-primary/60'
                                }`}
                              >
                                <span>{item.name}</span>
                                <motion.span
                                  animate={{ rotate: featuresExpanded ? 180 : 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <ChevronDown size={14} />
                                </motion.span>
                              </button>
                              <AnimatePresence>
                                {featuresExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="pb-2 px-2 space-y-0.5">
                                      <Link
                                        href="/features"
                                        onClick={() => setIsDrawerOpen(false)}
                                        className="block px-2.5 py-1.5 text-xs text-primary font-medium hover:opacity-80"
                                      >
                                        Browse all features →
                                      </Link>
                                      {drawerFeatureLinks.map((f) => (
                                        <Link
                                          key={f.href}
                                          href={f.href}
                                          onClick={() => setIsDrawerOpen(false)}
                                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                                            pathname === f.href
                                              ? 'bg-primary/8 text-primary'
                                              : 'text-muted-foreground hover:bg-muted'
                                          }`}
                                        >
                                          <f.icon size={13} className="flex-shrink-0" />
                                          <span className="text-xs font-medium">{f.name}</span>
                                        </Link>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ) : (
                            <Link
                              href={item.href}
                              onClick={() => setIsDrawerOpen(false)}
                              className={`block p-2.5 hover:text-primary/80 underline-offset-4 transition-colors ${
                                activeHref === item.href
                                  ? 'text-primary font-medium'
                                  : 'text-primary/60'
                              }`}
                            >
                              {item.name}
                            </Link>
                          )}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </motion.ul>

                <div className="flex flex-col gap-2">
                  <Link
                    href="/login/realtor"
                    className="flex h-8 w-full items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition-all ease-out active:scale-95"
                  >
                    Log in
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
