/**
 * Compose templates — the layouts the Studio composer renders onto a photo.
 *
 * Positions and sizes are fractions of the (square) canvas so a template is
 * resolution-independent. Colors resolve at draw time: `accent` is the
 * realtor's brand color, `light` and `dark` are fixed.
 */

export type ComposeColor = 'accent' | 'light' | 'dark';

export interface ComposeLayer {
  /** Field key — also the form input key. */
  key: string;
  label: string;
  placeholder: string;
  /** Anchor position, fractions of canvas size (0–1). */
  x: number;
  y: number;
  /** Font size as a fraction of canvas size. */
  size: number;
  weight: number;
  color: ComposeColor;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
}

export interface ComposeTemplate {
  id: string;
  label: string;
  /** A solid band behind the text, from `y` to the bottom edge. */
  band: { y: number; color: ComposeColor; opacity: number };
  layers: ComposeLayer[];
}

export const COMPOSE_TEMPLATES: ComposeTemplate[] = [
  {
    id: 'just-listed',
    label: 'Just Listed',
    band: { y: 0.64, color: 'dark', opacity: 0.55 },
    layers: [
      { key: 'eyebrow', label: 'Headline', placeholder: 'Just Listed', x: 0.5, y: 0.73, size: 0.04, weight: 700, color: 'accent', align: 'center', uppercase: true },
      { key: 'price', label: 'Price', placeholder: '$749,000', x: 0.5, y: 0.82, size: 0.088, weight: 700, color: 'light', align: 'center', uppercase: false },
      { key: 'address', label: 'Address', placeholder: '123 Oak Street, Austin TX', x: 0.5, y: 0.9, size: 0.034, weight: 500, color: 'light', align: 'center', uppercase: false },
    ],
  },
  {
    id: 'open-house',
    label: 'Open House',
    band: { y: 0.64, color: 'dark', opacity: 0.55 },
    layers: [
      { key: 'eyebrow', label: 'Headline', placeholder: 'Open House', x: 0.5, y: 0.73, size: 0.04, weight: 700, color: 'accent', align: 'center', uppercase: true },
      { key: 'datetime', label: 'Date & time', placeholder: 'Saturday 1–3pm', x: 0.5, y: 0.82, size: 0.07, weight: 700, color: 'light', align: 'center', uppercase: false },
      { key: 'address', label: 'Address', placeholder: '123 Oak Street, Austin TX', x: 0.5, y: 0.9, size: 0.034, weight: 500, color: 'light', align: 'center', uppercase: false },
    ],
  },
  {
    id: 'just-sold',
    label: 'Just Sold',
    band: { y: 0.64, color: 'accent', opacity: 0.92 },
    layers: [
      { key: 'eyebrow', label: 'Headline', placeholder: 'Just Sold', x: 0.5, y: 0.76, size: 0.072, weight: 700, color: 'light', align: 'center', uppercase: true },
      { key: 'address', label: 'Address', placeholder: '123 Oak Street, Austin TX', x: 0.5, y: 0.87, size: 0.034, weight: 500, color: 'light', align: 'center', uppercase: false },
    ],
  },
];
