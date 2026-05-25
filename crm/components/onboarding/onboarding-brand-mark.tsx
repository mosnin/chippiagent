'use client';

/**
 * Small stylised brand mark for the onboarding hero. A clean rounded-diamond
 * with a single brand-orange gradient — no inner gloss, no drop shadow. Reads
 * as flat ink on the warm paper canvas. Sized for the focal moment (~48px).
 */
export function OnboardingBrandMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="chippi-brand-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFB056" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>
      </defs>
      <path
        d="M28 6 L46 18 V38 L28 50 L10 38 V18 Z"
        fill="url(#chippi-brand-grad)"
      />
    </svg>
  );
}
