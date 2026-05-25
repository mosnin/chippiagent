import {
  Users,
  UserCircle,
  Briefcase,
  MessageCircle,
  Settings,
  Calendar,
  ClipboardList,
  Building2,
  FolderOpen,
  Aperture,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NavChild {
  href: string;
  label: string;
  exact?: boolean;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Sub-items that expand inline */
  children?: NavChild[];
  /** Show as AI assistant item with chip avatar */
  isAI?: boolean;
  /** Badge key for dynamic counts (e.g. 'leads', 'followUps') */
  badgeKey?: string;
}

// ── Realtor sidebar nav ──────────────────────────────────────────────────────
//
// Chippi is the home — the chat surface IS the OS. The Chippi entry expands
// into the agent's sub-surfaces (Full day, Drafts, Activity, Memory,
// Integrations), so the chat root stays a clean chat-first hero and the
// realtor reaches the dashboards via the dropdown rather than scrolling
// past them every time they want to talk to Chippi.
//
// Everything else in the sidebar is the realtor-facing substrate they still
// expect from a CRM: People, Deals, Calendar, Properties, Intake.

export const realtorNavItems: NavItem[] = [
  {
    href: '/chippi',
    label: 'Chippi',
    icon: MessageCircle,
    isAI: true,
    badgeKey: 'pendingDrafts',
    children: [
      { href: '/chippi/today', label: 'Full day' },
      { href: '/routines', label: 'Routines' },
      { href: '/chippi/drafts', label: 'Drafts' },
      { href: '/chippi/activity', label: 'Activity' },
      { href: '/chippi/memory', label: 'Memory' },
      { href: '/integrations', label: 'Integrations' },
    ],
  },
  {
    href: '/contacts',
    label: 'People',
    icon: Users,
    badgeKey: 'leads',
  },
  {
    href: '/deals',
    label: 'Deals',
    icon: Briefcase,
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: Calendar,
  },
  {
    href: '/properties',
    label: 'Properties',
    icon: Building2,
    badgeKey: 'properties',
    children: [
      { href: '/deals/new', label: 'Add property' },
      { href: '/properties/commissions', label: 'Commissions' },
    ],
  },
  {
    href: '/studio',
    label: 'Studio',
    icon: Aperture,
    children: [
      { href: '/studio/create', label: 'Create' },
      { href: '/studio/edit', label: 'Edit' },
      { href: '/studio/compose', label: 'Compose' },
      { href: '/studio/schedule', label: 'Schedule' },
      { href: '/studio/library', label: 'Library' },
      { href: '/studio/brand', label: 'Brand' },
    ],
  },
  {
    href: '/files',
    label: 'Files',
    icon: FolderOpen,
    children: [
      { href: '/documents', label: 'Documents' },
    ],
  },
  {
    href: '/profile-page',
    label: 'Profile',
    icon: UserCircle,
  },
  {
    href: '/intake',
    label: 'Intake form',
    icon: ClipboardList,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
  },
];

/**
 * Secondary "More" section — intentionally empty. The sidebar checks
 * `realtorMoreNavItems.length > 0` and hides the section when it is.
 *
 * Routes that used to live here are reachable two ways:
 *   - Settings → Integrations (was: /integrations)
 *   - Settings → Chippi → Build your own agents (was: /agents)
 *   - Per-surface stats tabs (was: /analytics)
 * Anything else is reachable by direct URL but doesn't earn nav weight.
 */
export const realtorMoreNavItems: NavItem[] = [];

// ── Header right-side menu ───────────────────────────────────────────────────

export const secondaryNavItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Primary items with shorter labels for the mobile bottom bar. */
export const mobileNavItems = [
  { href: '/chippi', label: 'Chippi', icon: MessageCircle },
  { href: '/contacts', label: 'People', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;
