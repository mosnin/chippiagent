# Public Website Next.js Folder Structure

> **TL;DR:** Defines the recommended Next.js app router folder structure for organizing public SaaS website routes, components, and assets.
> **Covers:** app directory routes, component directory layout, public assets, naming conventions | **Depends on:** saas_website_page_system.md, sitemap_diagram.md | **Used by:** None | **Phase:** 13

## Purpose

Define a clean recommended folder structure for building the public SaaS website in Next.js.

## Recommended Root Structure

```text
app/
components/
lib/
hooks/
public/
styles/
types/
```

## App Directory

```text
app/
  layout.tsx
  page.tsx
  product/
    page.tsx
  pricing/
    page.tsx
  solutions/
    page.tsx
  case-studies/
    page.tsx
  features/
    page.tsx
  integrations/
    page.tsx
  security/
    page.tsx
  docs/
    page.tsx
  blog/
    page.tsx
  about/
    page.tsx
  contact/
    page.tsx
  privacy/
    page.tsx
  terms/
    page.tsx
```

## Components Directory

```text
components/
  layout/
  navigation/
  sections/
  cards/
  forms/
  ui/
```

## Public Assets

```text
public/
  images/
  logos/
  icons/
```

## Naming Rules

- use lowercase folders
- use hyphen separated route names
- avoid deeply nested route complexity unless necessary

## Final Principle

Folder structure should support clarity and reuse. Public site sections should be organized by component type and route intent, not by random page one offs.
