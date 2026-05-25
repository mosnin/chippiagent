/**
 * Client-side helper to fire conversion events on successful form submission.
 * Each function checks whether the corresponding pixel SDK is loaded before calling.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (...args: unknown[]) => void };
    gtag?: (...args: unknown[]) => void;
    twq?: (...args: unknown[]) => void;
    lintrk?: (action: string, data: Record<string, unknown>) => void;
    snaptr?: (...args: unknown[]) => void;
  }
}

/**
 * Fire conversion events for all active tracking pixels.
 * Call this only after a successful form submission (not on page load).
 */
export function fireConversionEvents() {
  // Meta/Facebook: Lead event
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      window.fbq('track', 'Lead');
    } catch {
      // Silently ignore pixel errors
    }
  }

  // TikTok: SubmitForm event
  if (typeof window !== 'undefined' && window.ttq && typeof window.ttq.track === 'function') {
    try {
      window.ttq.track('SubmitForm');
    } catch {
      // Silently ignore pixel errors
    }
  }

  // Google Analytics / Google Ads: generate_lead event
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    try {
      window.gtag('event', 'generate_lead');
    } catch {
      // Silently ignore pixel errors
    }
  }

  // Twitter/X: conversion event
  if (typeof window !== 'undefined' && typeof window.twq === 'function') {
    try {
      window.twq('event', 'tw-conversion', {});
    } catch {
      // Silently ignore pixel errors
    }
  }

  // LinkedIn: conversion event
  if (typeof window !== 'undefined' && typeof window.lintrk === 'function') {
    try {
      window.lintrk('track', { conversion_id: 'form_submission' });
    } catch {
      // Silently ignore pixel errors
    }
  }

  // Snapchat: SIGN_UP event
  if (typeof window !== 'undefined' && typeof window.snaptr === 'function') {
    try {
      window.snaptr('track', 'SIGN_UP');
    } catch {
      // Silently ignore pixel errors
    }
  }
}
