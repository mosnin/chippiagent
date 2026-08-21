/**
 * Escape characters that have special meaning in HTML.
 * Use for any applicant- or realtor-supplied string interpolated into HTML.
 */
export function escapeHtml(value: string | number | boolean | null | undefined): string {
  if (value == null || value === '') return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
