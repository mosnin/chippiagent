'use client';

import { useEffect } from 'react';

/**
 * Listens for `postMessage` events from the parent window (the customize
 * page's iframe parent) and applies live customization updates without a
 * full reload. Mounted only when `?preview=1` is present.
 *
 * Same-origin enforced. Anything else is dropped on the floor.
 *
 * Live channel (CSS-driven, no React re-render needed):
 *   - accentColor → CSS var `--intake-accent` on <html>
 *   - darkMode    → toggles `.dark` class on <html>
 *
 * Semantic edits (thank-you copy, page title, intro, etc.) require Save —
 * the iframe re-mounts via the parent's `previewVersion` key bump.
 *
 * Also re-broadcasts the message as a `chippi:preview-update` CustomEvent on
 * `window` so any in-page client component that wants to subscribe can do so
 * without re-implementing the origin check.
 */

const FONT_CLASS_NAMES = ['font-sans', 'font-serif', 'font-mono'];

export function PreviewBridge() {
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Same-origin only — non-negotiable.
      if (e.origin !== window.location.origin) return;
      if (typeof e.data !== 'object' || e.data === null) return;
      if ((e.data as { type?: unknown }).type !== 'chippi:preview-update') return;

      const c = (e.data as { customization?: Record<string, unknown> }).customization;
      if (!c || typeof c !== 'object') return;

      const root = document.documentElement;

      // Accent color → CSS var.
      if (typeof c.accentColor === 'string' && c.accentColor) {
        root.style.setProperty('--intake-accent', c.accentColor);
      }

      // Dark mode → .dark class on <html>.
      if (typeof c.darkMode === 'boolean') {
        root.classList.toggle('dark', c.darkMode);
      }

      // Font → swap font-* class on <html>. Maps the 4 supported fonts.
      // 'system' clears all font classes (uses inherited default).
      if (typeof c.font === 'string') {
        for (const cls of FONT_CLASS_NAMES) root.classList.remove(cls);
        if (c.font === 'sans') root.classList.add('font-sans');
        else if (c.font === 'serif') root.classList.add('font-serif');
        else if (c.font === 'mono') root.classList.add('font-mono');
        // 'system' → no class added.
      }

      // Re-broadcast for in-page listeners (e.g. a future component that
      // wants to live-update thank-you copy without a full reload).
      window.dispatchEvent(
        new CustomEvent('chippi:preview-update', { detail: c }),
      );
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return null;
}
