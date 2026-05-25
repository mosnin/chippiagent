'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Mail,
  Building2,
  Menu,
  Sun,
  Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useTheme } from '@/components/theme-provider';
import { BrandLogo } from '@/components/brand-logo';
import { SeatUsagePill, normalizeSeatUsage, type SeatPlan } from '@/components/broker/seat-usage-pill';
import { useState } from 'react';

export interface BrokerShellSeatUsage {
  plan: SeatPlan;
  used: number;
  seatLimit: number | null;
}

const navItems = [
  { href: '/broker', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false },
  { href: '/broker/members', label: 'Members', icon: Users, exact: false },
  { href: '/broker/invitations', label: 'Invitations', icon: Mail, exact: false },
];

function NavLink({
  item,
  pathname,
  onClick,
}: {
  item: (typeof navItems)[number];
  pathname: string;
  onClick?: () => void;
}) {
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
    >
      <item.icon
        size={16}
        className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

interface BrokerShellProps {
  children: React.ReactNode;
  brokerageName: string;
  realtorSlug: string; // link back to the realtor's workspace
  /**
   * Optional seat usage data for the current brokerage. When provided and
   * well-formed, a compact SeatUsagePill is rendered in the top bar. If the
   * prop is absent or malformed (e.g. pre-migration, when plan/seatLimit
   * columns don't exist yet) the pill is omitted without crashing the shell.
   */
  seatUsage?: BrokerShellSeatUsage;
}

export function BrokerShell({ children, brokerageName, realtorSlug, seatUsage }: BrokerShellProps) {
  // Pre-migration resilience: silently drop the pill if the shape is off.
  const normalizedSeatUsage = normalizeSeatUsage(seatUsage);
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <nav className="flex-1 px-3 pt-4 pb-2 space-y-0.5">
      <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        Brokerage
      </p>
      {navItems.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setOpen(false)} />
      ))}
    </nav>
  );

  return (
    <div className="app-theme flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 min-h-screen bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="px-4 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate text-sidebar-foreground">
                {brokerageName}
              </p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">Broker Dashboard</p>
            </div>
          </div>
        </div>
        {sidebar}
        <div className="px-3 pb-4 border-t border-sidebar-border pt-3">
          <Link
            href={`/s/${realtorSlug}`}
            className="group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150"
          >
            <span className="opacity-55 group-hover:opacity-80">&larr;</span>
            My realtor workspace
          </Link>
          <div className="flex items-center gap-2 px-3 pt-3">
            <BrandLogo className="h-4" alt="Chippi" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card sticky top-0 z-40 shadow-[0_1px_0_0_var(--border)]">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger className="md:hidden">
                <Menu size={20} className="text-muted-foreground" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
                <SheetHeader className="px-4 py-5 border-b border-sidebar-border">
                  <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
                    <Building2 size={16} className="text-primary" />
                    <span className="text-sm font-semibold truncate">{brokerageName}</span>
                  </SheetTitle>
                </SheetHeader>
                {sidebar}
                <div className="border-t border-sidebar-border px-3 py-3">
                  <Link
                    href={`/s/${realtorSlug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
                  >
                    ← My workspace
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
            <span className="font-semibold text-sm md:hidden flex items-center gap-2">
              <Building2 size={14} className="text-primary" />
              {brokerageName}
            </span>
            <span className="hidden md:block font-medium text-sm text-foreground">
              Broker Dashboard
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {normalizedSeatUsage && (
              <Link
                href="/broker/billing"
                className="hidden sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                aria-label="Brokerage seat usage — open billing"
              >
                <SeatUsagePill
                  plan={normalizedSeatUsage.plan}
                  used={normalizedSeatUsage.used}
                  seatLimit={normalizedSeatUsage.seatLimit}
                />
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </Button>
            <UserButton />
          </div>
        </header>

        <main className="flex-1 px-4 py-5 md:px-8 md:py-7 pb-20 md:pb-7">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex safe-area-bottom">
        {navItems.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <div
                className={cn(
                  'w-9 h-6 rounded-full flex items-center justify-center transition-colors',
                  isActive ? 'bg-primary/10' : '',
                )}
              >
                <item.icon size={18} />
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
