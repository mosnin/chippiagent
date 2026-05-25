import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

const legalPages = [
  { href: '/legal/terms', label: 'Terms of Service' },
  { href: '/legal/privacy', label: 'Privacy Policy' },
  { href: '/legal/cookies', label: 'Cookie Policy' },
  { href: '/legal/acceptable-use', label: 'Acceptable Use Policy' },
  { href: '/legal/dpa', label: 'Data Processing Agreement' },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo className="h-7" alt="Chippi" />
          </Link>
          <Link href="/sign-up" className="text-sm rounded-full bg-primary text-primary-foreground px-4 py-2 font-medium">
            Start free trial
          </Link>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row gap-12">
        <aside className="md:w-56 shrink-0">
          <nav className="sticky top-24 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Legal</p>
            {legalPages.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className="block text-sm py-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                {page.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 max-w-3xl">{children}</main>
      </div>
    </div>
  );
}
