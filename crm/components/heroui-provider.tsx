'use client';

// HeroUI v3 does not ship a HeroUIProvider — components work standalone.
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
