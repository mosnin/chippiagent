'use client';

import { usePathname } from 'next/navigation';
import { PageTransition } from '@/components/motion/page-transition';
import { DashboardFooter } from '@/components/dashboard/footer';

interface LayoutShellProps {
  slug: string;
  children: React.ReactNode;
  liveNotifications: React.ReactNode;
}

/**
 * Client component so usePathname() always reflects the actual current route —
 * never stale from the Next.js router cache, which was the root cause of the
 * padding bug when navigating from /chippi to any dashboard page.
 */
export function LayoutShell({ slug, children, liveNotifications }: LayoutShellProps) {
  const pathname = usePathname() ?? '';
  const isChippiRoute = pathname.startsWith(`/s/${slug}/chippi`);

  if (isChippiRoute) {
    return (
      <main className="flex-1 min-h-0 flex flex-col bg-background text-foreground pb-[env(safe-area-inset-bottom)] md:pb-0">
        {liveNotifications}
        <PageTransition className="flex-1 min-h-0 flex flex-col">{children}</PageTransition>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto flex flex-col bg-background text-foreground">
      <div className="dashboard-content w-full max-w-[1500px] mx-auto flex-1 min-w-0 px-4 sm:px-6 md:px-10 lg:px-12 py-5 md:py-7 pb-40 md:pb-24">
        {liveNotifications}
        <PageTransition>{children}</PageTransition>
      </div>
      <div className="dashboard-footer-wrap w-full max-w-[1500px] mx-auto px-4 sm:px-6 md:px-10 lg:px-12 pb-4">
        <DashboardFooter />
      </div>
    </main>
  );
}
