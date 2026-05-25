'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Users,
  Building,
  Building2,
  Mail,
  CreditCard,
  ScrollText,
  Megaphone,
  Send,
  LineChart,
  BarChart3,
  Activity,
  Bot,
  Menu,
  Sun,
  Moon,
  Shield,
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
import { useState } from 'react';

const navSections = [
  {
    label: 'Management',
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/admin/users', label: 'Users', icon: Users, exact: false },
      { href: '/admin/brokerages', label: 'Brokerages', icon: Building2, exact: false },
      { href: '/admin/spaces', label: 'Spaces', icon: Building, exact: false },
      { href: '/admin/billing', label: 'Billing', icon: CreditCard, exact: false },
      { href: '/admin/invitations', label: 'Invitations', icon: Mail, exact: false },
    ],
  },
  {
    label: 'Growth',
    items: [
      { href: '/admin/broadcast', label: 'Broadcast', icon: Send, exact: false },
      { href: '/admin/announcements', label: 'Announcements', icon: Megaphone, exact: false },
      { href: '/admin/cohorts', label: 'Cohorts', icon: LineChart, exact: false },
      { href: '/admin/form-analytics', label: 'Form Analytics', icon: BarChart3, exact: false },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/scoring-health', label: 'Scoring Health', icon: Activity, exact: false },
      { href: '/admin/agent-stats', label: 'Agent Health', icon: Bot, exact: false },
      { href: '/admin/audit-log', label: 'Audit Log', icon: ScrollText, exact: false },
    ],
  },
];

const navItems = navSections.flatMap((s) => s.items);
const mobileNavItems = [
  navSections[0].items[0], // Overview
  navSections[0].items[1], // Users
  navSections[0].items[2], // Brokerages
  navSections[0].items[4], // Billing
  navSections[2].items[1], // Audit Log
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
  const isActive = item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      <item.icon
        size={16}
        className={cn(
          'flex-shrink-0',
          isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80'
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="app-theme flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 min-h-screen bg-sidebar border-r border-sidebar-border shrink-0">
        {/* Admin header */}
        <div className="px-4 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
              <Shield size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate text-sidebar-foreground">
                Admin
              </p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                Chippi Internal
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-4 pb-2 space-y-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="space-y-0.5">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {section.label}
              </p>
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 border-t border-sidebar-border pt-3">
          <Link
            href="/"
            className="group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150"
          >
            <span className="opacity-55 group-hover:opacity-80">←</span>
            Back to app
          </Link>
          <div className="flex items-center gap-2 px-3 pt-3">
            <BrandLogo className="h-4" alt="Chippi" />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card sticky top-0 z-40 shadow-[0_1px_0_0_var(--border)]">
          <div className="flex items-center gap-3">
            {/* Mobile menu */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger className="md:hidden">
                <Menu size={20} className="text-muted-foreground" />
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-64 p-0 bg-sidebar border-sidebar-border"
              >
                <SheetHeader className="px-4 py-5 border-b border-sidebar-border">
                  <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
                    <Shield size={16} className="text-primary" />
                    <span className="text-sm font-semibold">
                      Admin
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="px-3 py-4 space-y-4 overflow-y-auto">
                  {navSections.map((section) => (
                    <div key={section.label} className="space-y-0.5">
                      <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                        {section.label}
                      </p>
                      {section.items.map((item) => (
                        <NavLink
                          key={item.href}
                          item={item}
                          pathname={pathname}
                          onClick={() => setOpen(false)}
                        />
                      ))}
                    </div>
                  ))}
                  <div className="border-t border-sidebar-border mt-3 pt-3">
                    <Link
                      href="/"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
                    >
                      ← Back to app
                    </Link>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>

            <span className="font-semibold text-sm md:hidden flex items-center gap-2">
              <Shield size={14} className="text-primary" />
              Admin
            </span>

            <div className="hidden md:flex items-center gap-2 text-sm">
              <span className="font-medium text-foreground">Admin Dashboard</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
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

        {/* Page content */}
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7 pb-20 md:pb-7">
          <div className="w-full max-w-[1500px] mx-auto">
          {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex safe-area-bottom">
        {mobileNavItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <div
                className={cn(
                  'w-9 h-6 rounded-full flex items-center justify-center transition-colors',
                  isActive ? 'bg-primary/10' : ''
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
