import type { MetadataRoute } from 'next';

/**
 * PWA manifest — makes Chippi installable to the realtor's home screen.
 *
 * Realtors live between showings; a tab they have to remember to open is
 * dramatically less useful than an icon next to their phone app drawer.
 * The manifest alone gives the "Add to Home Screen" prompt + branded
 * splash on iOS 16.4+, Chrome desktop/mobile, Edge, and Safari macOS 17+.
 *
 * Push notifications are a separate piece — they need a service worker
 * registration + subscription endpoint + APNs/FCM relay. iOS PWA push has
 * silent-failure modes (Safari kills subs when the SW receives a push
 * but doesn't display a notification; EU PWAs lose push entirely under
 * the DMA fallout). For the actual mobile push story we wrap the same
 * Next.js app with Capacitor and ride native APNs/FCM. This manifest is
 * the floor — install + branding + the option to subscribe to web push
 * later if we want it.
 *
 * Theme color matches the dark-mode background token in globals.css.
 * Background color is white for the splash so the dark logo reads.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chippi — Agentic OS for Real Estate Agents & Brokerages',
    short_name: 'Chippi',
    description:
      'An AI agent that runs your realtor workspace — qualifies leads, drafts follow-ups, schedules tours, and keeps your pipeline current.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0c0c0d',
    icons: [
      {
        src: '/chip-avatar.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/chip-avatar.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['business', 'productivity'],
  };
}
