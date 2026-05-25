/**
 * The catalog of third-party apps Chippi can connect to. One entry per app
 * the realtor sees in the integrations panel. Composio's catalog has 100+
 * toolkits — we curate the subset that matters for a real-estate workflow
 * and surface those by name. The rest are reachable but not promoted.
 *
 * Curation principles (Jobs lens):
 *   - Default-promote the apps a realtor would already pay for. No "browse
 *     all 100" wall.
 *   - One entry per app, one connect button per entry. No multi-step
 *     wizards inside an entry.
 *   - Categories are guidance, not a filter dropdown — they help the
 *     realtor scan, not configure.
 *
 * The `toolkit` slug is what Composio knows the app as. We pass it
 * verbatim to `composio.toolkits.get(slug)` and to `composio.tools.list({
 * toolkits: [slug] })`. Don't change a slug without verifying against
 * Composio's live catalog.
 */

export type IntegrationCategory =
  | 'email'
  | 'messaging'
  | 'calendar'
  | 'docs'
  | 'crm'
  | 'real-estate'
  | 'social'
  | 'ads'
  | 'payments'
  | 'docs-sign'
  | 'tasks'
  | 'forms'
  | 'video'
  | 'storage';

export interface IntegrationApp {
  /** Composio toolkit slug — the canonical id we pass to the SDK. */
  toolkit: string;
  /** Display name shown to the realtor. */
  name: string;
  /** One-line description. Realtor language, no marketing fluff. */
  blurb: string;
  category: IntegrationCategory;
  /**
   * Promoted apps appear at the top of the integrations panel. Non-
   * promoted apps still connect but live in a "More" section. Default
   * true — anything in this catalog is at least curated.
   */
  promoted?: boolean;
  /**
   * True for apps we surface in the catalog but don't yet have a Composio
   * toolkit (or custom adapter) for. The UI renders a disabled
   * "Coming soon" pill instead of a Connect button. The connect route
   * 501s the slug as a defense-in-depth check — even if a stale client
   * sends a request, the route names the app and refuses cleanly.
   *
   * No active OAuth path → no IntegrationConnection row → these slugs
   * never reach the chat agent's tool list. Zero risk to the runtime.
   */
  comingSoon?: boolean;
  /**
   * Optional brand mark for the integration card. Single-color SVG sized
   * to a 24×24 viewBox, served from /public/integrations/. The card tints
   * it with `currentColor` so the mark inherits the row's text colour.
   * No iconUrl → the card renders a letter-circle fallback.
   */
  iconUrl?: string;
}

/**
 * Slugs that exist in the catalog but have no Composio toolkit (or custom
 * adapter) behind them yet. The connect route 501s these and the UI renders
 * them as a disabled "Coming soon" pill. Single source of truth so the
 * route and the catalog can't drift.
 */
export const COMING_SOON_TOOLKITS = new Set<string>([
  'compass',
  'boomtown',
  'kvcore',
  'real_geeks',
]);

/**
 * Catalog ordering matters — this is the order the realtor sees them.
 * Group within categories by use-frequency, not alphabetical.
 */
export const INTEGRATIONS: IntegrationApp[] = [
  // ── Email ────────────────────────────────────────────────────────────
  { toolkit: 'gmail', name: 'Gmail', blurb: 'Send drafts and watch for replies.', category: 'email', promoted: true, iconUrl: '/integrations/gmail.svg' },
  { toolkit: 'outlook', name: 'Outlook', blurb: 'Same, for Microsoft accounts.', category: 'email', promoted: true, iconUrl: '/integrations/outlook.svg' },
  { toolkit: 'mailchimp', name: 'Mailchimp', blurb: 'Drip nurture, listing announcements, monthly newsletters.', category: 'email', promoted: true, iconUrl: '/integrations/mailchimp.svg' },

  // ── Calendar ─────────────────────────────────────────────────────────
  { toolkit: 'googlecalendar', name: 'Google Calendar', blurb: 'Schedule tours, block time, see availability.', category: 'calendar', promoted: true, iconUrl: '/integrations/googlecalendar.svg' },
  { toolkit: 'outlook_calendar', name: 'Outlook Calendar', blurb: 'Same, for Microsoft accounts.', category: 'calendar', promoted: true, iconUrl: '/integrations/outlook.svg' },
  { toolkit: 'calendly', name: 'Calendly', blurb: 'Sync your booking link with Chippi.', category: 'calendar', promoted: true, iconUrl: '/integrations/calendly.svg' },
  { toolkit: 'cal', name: 'Cal.com', blurb: 'Open-source booking pages.', category: 'calendar' },

  // ── Messaging ────────────────────────────────────────────────────────
  // Twilio + WhatsApp are the realtor's phone — SMS for US clients, WhatsApp
  // for international and under-40 segment. Slack/Discord/Teams are internal
  // team comms; the SMS-class tools are client comms.
  { toolkit: 'twilio', name: 'Twilio', blurb: 'SMS and voice with US clients — Chippi can reply where the conversation actually lives.', category: 'messaging', promoted: true, iconUrl: '/integrations/twilio.svg' },
  { toolkit: 'whatsapp', name: 'WhatsApp', blurb: 'International buyers, co-buyer group threads, agent-to-agent.', category: 'messaging', promoted: true, iconUrl: '/integrations/whatsapp.svg' },
  { toolkit: 'slack', name: 'Slack', blurb: 'Post deals, alerts, and updates to your team channel.', category: 'messaging', promoted: true, iconUrl: '/integrations/slack.svg' },
  { toolkit: 'discord', name: 'Discord', blurb: 'Same, for Discord servers.', category: 'messaging', iconUrl: '/integrations/discord.svg' },
  { toolkit: 'microsoft_teams', name: 'Microsoft Teams', blurb: 'Same, for Teams channels.', category: 'messaging', iconUrl: '/integrations/microsoftteams.svg' },

  // ── Social ───────────────────────────────────────────────────────────
  // Lead-gen surfaces — DMs, page messages, post-engagement signals.
  // Composio provisions these as standard OAuth toolkits.
  { toolkit: 'facebook', name: 'Facebook', blurb: 'Reach prospects from your page DMs and post comments.', category: 'social', promoted: true, iconUrl: '/integrations/facebook.svg' },
  { toolkit: 'instagram', name: 'Instagram', blurb: 'Surface DMs and listing-post engagement.', category: 'social', promoted: true, iconUrl: '/integrations/instagram.svg' },
  { toolkit: 'linkedin', name: 'LinkedIn', blurb: 'Track outbound and inbound on your professional network.', category: 'social', promoted: true, iconUrl: '/integrations/linkedin.svg' },
  { toolkit: 'reddit', name: 'Reddit', blurb: 'Watch local-market subreddits for buyer signals.', category: 'social', iconUrl: '/integrations/reddit.svg' },
  { toolkit: 'youtube', name: 'YouTube', blurb: 'Upload listing tours and market-update videos, pull view counts.', category: 'social', promoted: true, iconUrl: '/integrations/youtube.svg' },

  // ── Ads ──────────────────────────────────────────────────────────────
  // Paid-acquisition reporting and lead-form pulls.
  { toolkit: 'google_ads', name: 'Google Ads', blurb: 'Pull campaign performance and lead-form submissions.', category: 'ads', promoted: true, iconUrl: '/integrations/googleads.svg' },

  // ── Payments ─────────────────────────────────────────────────────────
  // Earnest-money deposits, transaction-coordination retainers, listing-prep
  // fees. Realtors increasingly take money directly instead of waiting on
  // closing — Chippi can draft and send the payment link.
  { toolkit: 'stripe', name: 'Stripe', blurb: 'Collect earnest deposits, retainers, and service fees.', category: 'payments', promoted: true, iconUrl: '/integrations/stripe.svg' },

  // ── Docs ─────────────────────────────────────────────────────────────
  { toolkit: 'notion', name: 'Notion', blurb: 'Capture deals, tours, and notes in your workspace.', category: 'docs', promoted: true, iconUrl: '/integrations/notion.svg' },
  { toolkit: 'googledocs', name: 'Google Docs', blurb: 'Open and edit listing descriptions, scripts, briefs.', category: 'docs', iconUrl: '/integrations/googledocs.svg' },
  { toolkit: 'googlesheets', name: 'Google Sheets', blurb: 'Update lead trackers and pipeline reports.', category: 'docs', promoted: true, iconUrl: '/integrations/googlesheets.svg' },

  // ── Storage ──────────────────────────────────────────────────────────
  { toolkit: 'googledrive', name: 'Google Drive', blurb: 'Pull listing photos and disclosures Chippi can attach to drafts.', category: 'storage', iconUrl: '/integrations/googledrive.svg' },
  { toolkit: 'onedrive', name: 'OneDrive', blurb: 'Same, for Microsoft accounts.', category: 'storage', iconUrl: '/integrations/onedrive.svg' },
  { toolkit: 'dropbox', name: 'Dropbox', blurb: 'Same, for Dropbox.', category: 'storage', iconUrl: '/integrations/dropbox.svg' },

  // ── CRM (general) ────────────────────────────────────────────────────
  // HubSpot is the one most realtors land on. The rest are here for the
  // brokerage that already lives inside Salesforce/Pipedrive/Zoho — we
  // call out what's distinct so the row doesn't read as catalog padding.
  { toolkit: 'hubspot', name: 'HubSpot', blurb: 'Sync deals and contacts both ways.', category: 'crm', promoted: true, iconUrl: '/integrations/hubspot.svg' },
  { toolkit: 'salesforce', name: 'Salesforce', blurb: 'Mirror to your brokerage Salesforce org.', category: 'crm', iconUrl: '/integrations/salesforce.svg' },
  { toolkit: 'pipedrive', name: 'Pipedrive', blurb: 'Push pipeline stages into Pipedrive.', category: 'crm' },
  { toolkit: 'zoho', name: 'Zoho CRM', blurb: 'Two-way sync with Zoho.', category: 'crm', iconUrl: '/integrations/zoho.svg' },

  // ── Real estate ──────────────────────────────────────────────────────
  // Slugs are snake_case to match Composio's catalog convention.
  { toolkit: 'follow_up_boss', name: 'Follow-up Boss', blurb: 'Sync your Follow-up Boss pipeline into Chippi.', category: 'real-estate', promoted: true },
  { toolkit: 'compass', name: 'Compass', blurb: 'Sync your Compass pipeline.', category: 'real-estate', promoted: true, comingSoon: true },
  { toolkit: 'boomtown', name: 'BoomTown', blurb: 'Pull BoomTown leads into Chippi.', category: 'real-estate', promoted: true, comingSoon: true },
  { toolkit: 'kvcore', name: 'kvCORE', blurb: 'Pull kvCORE leads and tasks into Chippi.', category: 'real-estate', promoted: true, comingSoon: true },
  { toolkit: 'real_geeks', name: 'Real Geeks', blurb: 'Pull Real Geeks leads into Chippi.', category: 'real-estate', comingSoon: true },

  // ── Documents + signing ──────────────────────────────────────────────
  { toolkit: 'docusign', name: 'DocuSign', blurb: 'Send contracts and disclosures for signature.', category: 'docs-sign', promoted: true, iconUrl: '/integrations/docusign.svg' },
  { toolkit: 'dropbox_sign', name: 'Dropbox Sign', blurb: 'Same, for Dropbox Sign.', category: 'docs-sign' },

  // ── Tasks / project management ───────────────────────────────────────
  { toolkit: 'asana', name: 'Asana', blurb: 'Task list for follow-ups, listing prep, closing checklist.', category: 'tasks', iconUrl: '/integrations/asana.svg' },
  { toolkit: 'trello', name: 'Trello', blurb: 'Boards for prospects, listings, closings.', category: 'tasks', iconUrl: '/integrations/trello.svg' },

  // ── Forms / lead intake ──────────────────────────────────────────────
  { toolkit: 'typeform', name: 'Typeform', blurb: 'Pull form responses into Chippi as new leads.', category: 'forms', iconUrl: '/integrations/typeform.svg' },
  { toolkit: 'googleforms', name: 'Google Forms', blurb: 'Same, for Google Forms.', category: 'forms', iconUrl: '/integrations/googleforms.svg' },

  // ── Video / meetings ─────────────────────────────────────────────────
  { toolkit: 'zoom', name: 'Zoom', blurb: 'Schedule virtual showings and broker calls.', category: 'video', iconUrl: '/integrations/zoom.svg' },
  { toolkit: 'googlemeet', name: 'Google Meet', blurb: 'Same, for Google Meet.', category: 'video', iconUrl: '/integrations/googlemeet.svg' },
  { toolkit: 'loom', name: 'Loom', blurb: 'Async property walkthroughs and contract explanations buyers can replay.', category: 'video', promoted: true, iconUrl: '/integrations/loom.svg' },

  // ── Spreadsheets / lists ─────────────────────────────────────────────
  { toolkit: 'airtable', name: 'Airtable', blurb: 'Two-way sync for custom pipelines and lists.', category: 'docs', iconUrl: '/integrations/airtable.svg' },
];

/** Look up by slug. Returns undefined for unknown toolkits. */
export function findIntegration(toolkit: string): IntegrationApp | undefined {
  return INTEGRATIONS.find((a) => a.toolkit === toolkit);
}

/** All toolkit slugs Composio knows about for our app. */
export function allToolkitSlugs(): string[] {
  return INTEGRATIONS.map((a) => a.toolkit);
}

/** Toolkits we surface in the Connect panel's primary section. */
export function promotedIntegrations(): IntegrationApp[] {
  return INTEGRATIONS.filter((a) => a.promoted);
}

/** Group by category for the integrations panel. */
export function integrationsByCategory(): Record<IntegrationCategory, IntegrationApp[]> {
  const grouped = {} as Record<IntegrationCategory, IntegrationApp[]>;
  for (const app of INTEGRATIONS) {
    if (!grouped[app.category]) grouped[app.category] = [];
    grouped[app.category].push(app);
  }
  return grouped;
}
