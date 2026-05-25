/**
 * Pure-function tests for the integration catalog.
 *
 * These tests guard the catalog's invariants — duplicates, empty fields,
 * stray slugs — so a quick edit to add or remove an app can't silently
 * ship a broken connect button.
 */

import { describe, it, expect } from 'vitest';
import {
  INTEGRATIONS,
  COMING_SOON_TOOLKITS,
  findIntegration,
  allToolkitSlugs,
  promotedIntegrations,
  integrationsByCategory,
  type IntegrationCategory,
} from '@/lib/integrations/catalog';

const VALID_CATEGORIES: ReadonlySet<IntegrationCategory> = new Set<IntegrationCategory>([
  'email',
  'messaging',
  'calendar',
  'docs',
  'crm',
  'real-estate',
  'social',
  'ads',
  'payments',
  'docs-sign',
  'tasks',
  'forms',
  'video',
  'storage',
]);

// snake-case-ish (lowercase letters, digits, optional underscores; NO leading/
// trailing underscore, no double-underscore). Composio slugs we ship match this.
const SLUG_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/;

describe('findIntegration', () => {
  it('returns the entry for a known slug', () => {
    const gmail = findIntegration('gmail');
    expect(gmail).toBeDefined();
    expect(gmail?.toolkit).toBe('gmail');
    expect(gmail?.name).toBe('Gmail');
  });

  it('returns undefined for unknown slugs', () => {
    expect(findIntegration('not_a_real_toolkit')).toBeUndefined();
    expect(findIntegration('')).toBeUndefined();
    // Case sensitivity matters — Composio slugs are lowercase.
    expect(findIntegration('Gmail')).toBeUndefined();
  });
});

describe('allToolkitSlugs', () => {
  it('contains no duplicate slugs', () => {
    const slugs = allToolkitSlugs();
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('returns one slug per catalog entry', () => {
    expect(allToolkitSlugs()).toHaveLength(INTEGRATIONS.length);
  });
});

describe('promotedIntegrations', () => {
  it('is non-empty — the panel must show something above the fold', () => {
    expect(promotedIntegrations().length).toBeGreaterThan(0);
  });

  it('only contains entries with promoted=true', () => {
    for (const entry of promotedIntegrations()) {
      expect(entry.promoted).toBe(true);
    }
  });
});

describe('integrationsByCategory', () => {
  it('covers every catalog entry exactly once', () => {
    const grouped = integrationsByCategory();
    const flat = (Object.values(grouped) as Array<typeof INTEGRATIONS>).flat();
    expect(flat).toHaveLength(INTEGRATIONS.length);
    // Every original entry must appear exactly once after grouping.
    const seen = new Set<string>();
    for (const e of flat) {
      expect(seen.has(e.toolkit)).toBe(false);
      seen.add(e.toolkit);
    }
    for (const e of INTEGRATIONS) {
      expect(seen.has(e.toolkit)).toBe(true);
    }
  });

  it('only buckets entries under categories from the IntegrationCategory enum', () => {
    const grouped = integrationsByCategory();
    for (const cat of Object.keys(grouped)) {
      // Use type assertion + the union list — the union here is the source of truth.
      expect(VALID_CATEGORIES.has(cat as IntegrationCategory), `unknown category: ${cat}`).toBe(true);
    }
  });
});

describe('catalog entry shape', () => {
  it('every entry has non-empty name + blurb + valid category + valid slug', () => {
    for (const e of INTEGRATIONS) {
      expect(e.name.trim().length, `name for ${e.toolkit}`).toBeGreaterThan(0);
      expect(e.blurb.trim().length, `blurb for ${e.toolkit}`).toBeGreaterThan(0);
      expect(VALID_CATEGORIES.has(e.category), `category for ${e.toolkit}`).toBe(true);
      expect(SLUG_RE.test(e.toolkit), `slug shape for ${e.toolkit}`).toBe(true);
    }
  });

  it('catalog size snapshot — accidental cuts surface loudly', () => {
    // Bump this number on purpose when the catalog grows or shrinks.
    // A drive-by removal that drops Gmail or Slack will fail this test.
    expect(INTEGRATIONS.length).toBe(44);
  });

  it('includes the load-bearing realtor apps', () => {
    // These specific slugs are read by route logic and the chat — they
    // disappearing silently would be a bigger bug than a snapshot count.
    const slugs = new Set(allToolkitSlugs());
    expect(slugs.has('gmail')).toBe(true);
    expect(slugs.has('googlecalendar')).toBe(true);
    expect(slugs.has('follow_up_boss')).toBe(true);
  });
});

describe('catalog cuts (audit 7→8)', () => {
  it('Linear is gone — developer issue tracker, not a realtor tool', () => {
    expect(findIntegration('linear')).toBeUndefined();
  });

  it('Monday is gone — enterprise PM, not a realtor tool', () => {
    expect(findIntegration('monday')).toBeUndefined();
  });

  it('email and messaging are separate categories with the right apps', () => {
    const grouped = integrationsByCategory();
    expect(grouped.email).toBeDefined();
    expect(grouped.messaging).toBeDefined();
    expect(grouped.email.map((a) => a.toolkit).sort()).toEqual(['gmail', 'mailchimp', 'outlook']);
    expect(grouped.messaging.map((a) => a.toolkit).sort()).toEqual(
      ['discord', 'microsoft_teams', 'slack', 'twilio', 'whatsapp'],
    );
  });

  it('legacy "communication" category is gone from every entry', () => {
    const stale = INTEGRATIONS.filter(
      (a) => (a.category as string) === 'communication',
    );
    expect(stale).toEqual([]);
  });

  it('blurbs are unique within a category — no copy-paste padding', () => {
    const grouped = integrationsByCategory();
    for (const cat of Object.keys(grouped) as IntegrationCategory[]) {
      const seen = new Set<string>();
      for (const app of grouped[cat]) {
        expect(
          seen.has(app.blurb),
          `duplicate blurb "${app.blurb}" in category ${cat}`,
        ).toBe(false);
        seen.add(app.blurb);
      }
    }
  });
});

describe('COMING_SOON_TOOLKITS', () => {
  it('matches the set of catalog entries flagged comingSoon: true (no drift)', () => {
    // Drift between the per-entry flag and the centralized set is the
    // bug we're guarding against — if the route's 501-list goes stale,
    // the realtor taps Connect and Composio returns a confusing error.
    const flaggedInCatalog = new Set(
      INTEGRATIONS.filter((e) => e.comingSoon).map((e) => e.toolkit),
    );
    expect([...flaggedInCatalog].sort()).toEqual([...COMING_SOON_TOOLKITS].sort());
  });

  it('every coming-soon slug exists in INTEGRATIONS — no dangling entries', () => {
    const catalogSlugs = new Set(allToolkitSlugs());
    for (const s of COMING_SOON_TOOLKITS) {
      expect(catalogSlugs.has(s), `${s} should be in INTEGRATIONS`).toBe(true);
    }
  });
});
