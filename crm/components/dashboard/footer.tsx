'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DashboardFooter() {
  const pathname = usePathname() || '';
  // Hide on /chippi — that surface owns its own viewport (sticky composer +
  // transcript). A footer below the input adds visual noise to the chat.
  if (pathname.includes('/chippi')) return null;
  return (
    <footer className="pt-8 pb-1">
      <div className="border-t border-border/50 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground/70">
        <p>© {new Date().getFullYear()} Chippi. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link href="/legal/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
