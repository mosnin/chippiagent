# 19 — Internationalization Posture

> **TL;DR:** Establishes an English-only stance for v1, mandates the Intl API for date/currency/number formatting, and documents what would change for future multilingual support.
> **Covers:** language assumption, Intl API formatting, UTC storage, future i18n requirements, formatting utilities | **Depends on:** None | **Used by:** None | **Phase:** 14

> The framework's language and localization stance for v1 SaaS products.
> Zero ambiguity — no guessing whether to externalize strings or add i18n libraries.

---

## Current Language Assumption

- The framework assumes **English (US)** for v1.
- All UI text, error messages, email copy, and marketing content are written in English.
- No string externalization is required for v1.
- Hardcoded English strings in components are acceptable for v1.
- This is a deliberate choice, not an oversight.

---

## Date, Currency, and Number Formatting

Even in an English-only v1, use the **Intl API** for all formatting:

| Data Type | API | Notes |
|-----------|-----|-------|
| Currency | `Intl.NumberFormat` | Always show symbol, 2 decimal places |
| Numbers | `Intl.NumberFormat` | Comma separators for thousands |
| Dates | `Intl.DateTimeFormat` | Never hardcode `MM/DD/YYYY` |

This is not for i18n — it is for **correctness**. The Intl API handles edge cases (negative currency, large numbers, timezone-aware dates) better than manual formatting.

**Defaults:**

- Locale: `"en-US"`
- Store dates as **UTC** in the database.
- Display dates in the user's timezone (detected from browser or user settings).

---

## What Would Need to Change for Multilingual Support

If a future version requires multilingual support, the following areas are affected.

### String Externalization

- Extract all UI strings to translation files (JSON or similar).
- Use a library such as `next-intl`, `react-i18next`, or equivalent.
- Key naming convention: `[page].[section].[element]` (e.g., `dashboard.summary.totalRevenue`).
- Pluralization support (`1 item` vs `2 items`).

### Layout Considerations

- RTL (right-to-left) support for Arabic, Hebrew, etc.
- Text expansion — German text is ~30% longer than English; buttons and labels must accommodate.
- Font stack changes for CJK languages.
- Date format changes (`DD/MM/YYYY` for most of the world).

### Content Changes

- Marketing copy needs professional translation (not machine translation for public-facing pages).
- Email templates need per-locale versions.
- Error messages need translation.
- Legal pages need jurisdiction-specific versions.

### Technical Changes

- URL structure: `/en/pricing`, `/de/pricing` or subdomain-based.
- Language detection: `Accept-Language` header → user preference → default.
- SEO: `hreflang` tags for each supported language.
- Database: no schema changes needed if storing data as UTF-8 (which Prisma/PostgreSQL do by default).

---

## What to Do Now (v1)

1. **Use the Intl API for formatting** — low effort, high correctness.
2. **Do NOT externalize strings** — premature optimization for v1.
3. **Do NOT add i18n libraries** — unnecessary dependency before product-market fit.
4. **Store all timestamps as UTC.**
5. **Use UTF-8 everywhere** — already the default in Next.js + PostgreSQL.
6. If a specific project knows it will need i18n in v2, note it in `docs/project/05_tech_stack.md` and follow the string externalization pattern from the start.

---

## Formatting Utilities

Create a single shared module (`lib/format.ts`) with thin wrappers around Intl:

```ts
const DEFAULT_LOCALE = "en-US";

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE).format(value);
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, options).format(new Date(date));
}
```

All components import from this module. When i18n arrives later, only this file needs a locale parameter — call sites stay unchanged.

---

## Final Principle

i18n readiness in v1 means formatting correctly and storing data properly.
It does not mean building a translation system before you have users.
