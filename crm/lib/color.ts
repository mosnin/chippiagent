/**
 * Decide between white or near-black text for a given background hex color.
 * Uses the W3C relative luminance formula. Returns the higher-contrast option.
 */
export function pickContrastColor(bgHex: string): '#ffffff' | '#0c0c0d' {
  const hex = bgHex.replace('#', '');
  if (hex.length !== 6 && hex.length !== 3) return '#ffffff';
  const full = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  return luminance > 0.45 ? '#0c0c0d' : '#ffffff';
}
