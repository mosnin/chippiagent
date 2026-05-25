'use client';

import { useEffect, useRef } from 'react';

export function AmplitudeProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Lazy-load Amplitude so it never blocks initial page render.
    // The dynamic import keeps the 49 MB @amplitude bundle out of the
    // critical path for public pages (intake, tour booking, etc.).
    import('@amplitude/unified').then((amplitude) => {
      amplitude.initAll('246fdb1876379c5d56ce99456e6ce954', {
        analytics: { autocapture: true },
        sessionReplay: { sampleRate: 0.1 },
      });
    }).catch(() => {
      // Non-fatal — analytics is best-effort
    });
  }, []);

  return <>{children}</>;
}
