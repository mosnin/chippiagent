import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/theme-provider';
import { AmplitudeProvider } from '@/components/amplitude-provider';
import { MotionProvider } from '@/components/motion/motion-provider';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chippi — Agentic OS for Real Estate Agents & Brokerages',
  description: 'An AI agent that runs your realtor workspace — qualifies leads, drafts follow-ups, schedules tours, and keeps your pipeline current so you can focus on the deals that matter. Start your 7-day free trial.',
  keywords: ['agentic OS', 'AI agent', 'real estate', 'realtors', 'brokerages', 'AI lead scoring', 'lead qualification', 'tour scheduling', 'deal pipeline', 'CRM'],
  openGraph: {
    title: 'Chippi — Agentic OS for Real Estate Agents & Brokerages',
    description: 'An AI agent that runs your realtor workspace — qualifies leads, drafts follow-ups, schedules tours, and keeps your pipeline current.',
    siteName: 'Chippi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chippi — Agentic OS for Real Estate Agents & Brokerages',
    description: 'An AI agent that runs your realtor workspace — qualifies leads, drafts follow-ups, schedules tours, keeps your pipeline current.',
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0d' },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default' as const,
    title: 'Chippi',
  },
  icons: {
    icon: '/chip-avatar.png',
    apple: '/chip-avatar.png',
    shortcut: '/chip-avatar.png',
  },
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Public-facing pages (intake, booking, status) set this header in
  // middleware so we can skip ClerkProvider entirely — prevents Clerk's
  // client-side JS from loading and prompting visitors to sign in.
  const h = await headers();
  const isPublicPage = h.get('x-public-page') === '1';

  const renderShell = (body: React.ReactNode) => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider>
          <AmplitudeProvider>
            <MotionProvider>
              {body}
            </MotionProvider>
          </AmplitudeProvider>
        </ThemeProvider>
        <Toaster
          position="top-right"
          theme="system"
          toastOptions={{
            duration: 3500,
            unstyled: true,
            classNames: {
              toast:
                'group pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border/70 bg-popover p-3.5 text-foreground shadow-lg shadow-foreground/5 transition-all duration-150',
              title: 'text-sm font-medium leading-snug text-foreground',
              description: 'text-[13px] leading-snug text-muted-foreground',
              actionButton:
                'rounded-md bg-foreground px-2.5 py-1 text-[13px] font-medium text-background transition-colors duration-150 hover:bg-foreground/90',
              cancelButton:
                'rounded-md bg-muted px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/80',
              closeButton:
                'rounded-md border border-border/70 bg-background text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground',
              success: 'border-l-2 border-l-emerald-500/70',
              error: 'border-l-2 border-l-red-500/70',
              warning: 'border-l-2 border-l-orange-500/70',
              info: 'border-l-2 border-l-sky-500/70',
            },
          }}
        />
        <SpeedInsights />
      </body>
    </html>
  );

  if (isPublicPage) return renderShell(children);
  return <ClerkProvider>{renderShell(children)}</ClerkProvider>;
}
