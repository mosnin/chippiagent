'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { realtorNavItems, realtorMoreNavItems } from '@/lib/nav-items';
import type { NavItem, NavChild } from '@/lib/nav-items';
import { SECTION_LABEL } from '@/lib/typography';
import {
  SidebarCollapseProvider,
  CollapsedTooltip,
  useSidebarCollapsed,
} from '@/components/dashboard/sidebar-collapse';
import { SidebarConversations } from '@/components/dashboard/sidebar-conversations';
import { ChippiInstrument } from '@/components/dashboard/chippi-instrument';
import { PulseNumber } from '@/components/ui/pulse-number';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCircle,
  Mail,
  LayoutDashboard,
  SlidersHorizontal,
  Briefcase,
  ChevronsUpDown,
  PhoneIncoming,
  BarChart3,
  Trophy,
  FileText,
  Megaphone,
  MessageCircle,
  Upload,
  ArrowLeft,
  Settings,
  Key,
  Shuffle,
  GitBranch,
  CreditCard,
  Plus,
  Check,
  Search,
  Flag,
  History,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface SidebarProps {
  slug: string;
  spaceName: string;
  unreadLeadCount: number;
  pendingDraftCount?: number;
  overdueFollowUpCount?: number;
  activePropertyCount?: number;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
  brokerageName?: string | null;
  brokerageRole?: string | null;
  brokerageMemberships?: { id: string; name: string; role: string }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Broker nav definitions (unchanged structure)
// ═══════════════════════════════════════════════════════════════════════════════

// Phase 7 — broker admin sidebar collapses from 14 entries across 5 labeled
// sections to 5 primary items + a quiet "More" section for the rest.
//
// Primary (daily): Team · Leads · Pipeline · Members · Settings.
// More (one glance below — the routes that have existing users but don't
// earn daily prominence): Realtors, Templates, Team Chat, Announcements,
// Leaderboard, Analytics, Import/Export. Invitations folds into Members.
// Settings sub-pages (form-builder, tracking, MCP, auto-assignment, routing
// rules) live behind /broker/settings's own in-page tab strip.
const brokerAdminNavSections = [
  {
    label: '',
    items: [
      { href: '/broker', label: 'Team', icon: LayoutDashboard, exact: true, adminOnly: false },
      { href: '/broker/leads', label: 'Leads', icon: PhoneIncoming, exact: false, adminOnly: false },
      { href: '/broker/pipeline', label: 'Pipeline', icon: BarChart3, exact: false, adminOnly: false },
      { href: '/broker/reviews', label: 'Reviews', icon: Flag, exact: false, adminOnly: false },
      { href: '/broker/agent-activity', label: 'Chippi', icon: MessageCircle, exact: false, adminOnly: false },
      { href: '/broker/settings', label: 'Settings', icon: SlidersHorizontal, exact: false, adminOnly: true },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/broker/members', label: 'Members', icon: Users, exact: false, adminOnly: false },
      { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false, adminOnly: false },
      { href: '/broker/templates', label: 'Templates', icon: FileText, exact: false, adminOnly: false },
      { href: '/broker/chat', label: 'Team chat', icon: MessageCircle, exact: false, adminOnly: false },
      { href: '/broker/announcements', label: 'Announcements', icon: Megaphone, exact: false, adminOnly: false },
      { href: '/broker/leaderboard', label: 'Leaderboard', icon: Trophy, exact: false, adminOnly: false },
      { href: '/broker/analytics', label: 'Analytics', icon: BarChart3, exact: false, adminOnly: false },
      { href: '/broker/import-export', label: 'Import / export', icon: Upload, exact: false, adminOnly: true },
    ],
  },
];

// Phase 7 — realtor-members of a brokerage see their own work first.
// Team-wide tools live one glance below in the More section; routes are
// unchanged.
const brokerMemberNavSections = [
  {
    label: '',
    items: [
      { href: '/broker', label: 'My day', icon: LayoutDashboard, exact: true, adminOnly: false },
      { href: '/broker/my-leads', label: 'My leads', icon: PhoneIncoming, exact: false, adminOnly: false },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/broker/announcements', label: 'Announcements', icon: Megaphone, exact: false, adminOnly: false },
      { href: '/broker/chat', label: 'Team chat', icon: MessageCircle, exact: false, adminOnly: false },
      { href: '/broker/templates', label: 'Templates', icon: FileText, exact: false, adminOnly: false },
      { href: '/broker/leaderboard', label: 'Leaderboard', icon: Trophy, exact: false, adminOnly: false },
    ],
  },
];

const brokerSettingsNavSections = [
  {
    label: 'Brokerage',
    items: [
      { href: '/broker/settings', label: 'General', icon: Settings, exact: true },
      { href: '/broker/invitations', label: 'Invitations', icon: Mail, exact: false },
      { href: '/broker/settings/mcp', label: 'MCP', icon: Key, exact: false },
    ],
  },
  {
    label: 'Lead Management',
    items: [
      { href: '/broker/settings/auto-assignment', label: 'Auto-Assignment', icon: Shuffle, exact: false },
      { href: '/broker/settings/routing-rules', label: 'Routing rules', icon: GitBranch, exact: false },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/broker/billing', label: 'Billing', icon: CreditCard, exact: false },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers: determine active state for nav items and children
// ═══════════════════════════════════════════════════════════════════════════════

function isChildActive(child: NavChild, pathname: string, base: string, searchParams?: string): boolean {
  const [childPath, childQuery] = child.href.split('?');
  const fullHref = `${base}${childPath}`;

  // If the child has query params, match both pathname AND query params
  if (childQuery) {
    if (pathname !== fullHref && !pathname.startsWith(fullHref + '/')) return false;
    // Compare query params
    const childParams = new URLSearchParams(childQuery);
    const currentParams = new URLSearchParams(searchParams || '');
    for (const [key, value] of childParams.entries()) {
      if (currentParams.get(key) !== value) return false;
    }
    return true;
  }

  // No query params — use path matching
  if (child.exact) {
    // Exact match: pathname matches AND no filter query params present
    const currentParams = new URLSearchParams(searchParams || '');
    const hasFilterParams = currentParams.has('type') || currentParams.has('tier') || currentParams.has('sort');
    return pathname === fullHref && !hasFilterParams;
  }
  return pathname.startsWith(fullHref);
}

/** Returns true if the current pathname belongs to this item or any of its children. */
function doesItemOwnPath(item: NavItem, pathname: string, base: string): boolean {
  if (item.href === '') {
    return pathname === base;
  }
  if (item.children) {
    // Check children first — some children like /form-analytics don't share the parent prefix
    const childMatch = item.children.some((child) => {
      const childPath = child.href.split('?')[0];
      const fullChildPath = `${base}${childPath}`;
      return child.exact
        ? pathname === fullChildPath
        : pathname.startsWith(fullChildPath);
    });
    if (childMatch) return true;
  }
  return pathname.startsWith(`${base}${item.href}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Collapsible children wrapper with smooth CSS height animation
// ═══════════════════════════════════════════════════════════════════════════════

function CollapsibleChildren({
  children,
  isOpen,
}: {
  children: React.ReactNode;
  isOpen: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(isOpen ? undefined : 0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (isOpen) {
      const measured = el.scrollHeight;
      setHeight(0);
      setIsAnimating(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(measured);
        });
      });
    } else {
      const measured = el.scrollHeight;
      setHeight(measured);
      setIsAnimating(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(0);
        });
      });
    }
  }, [isOpen]);

  const handleTransitionEnd = useCallback(() => {
    setIsAnimating(false);
    if (isOpen) {
      setHeight(undefined); // Allow natural height after opening
    }
  }, [isOpen]);

  return (
    <div
      ref={contentRef}
      style={{ height: height !== undefined ? `${height}px` : 'auto' }}
      className={cn(
        'transition-[height] duration-200 ease-in-out',
        !isOpen && !isAnimating && 'hidden',
        isAnimating && 'overflow-hidden',
      )}
      onTransitionEnd={handleTransitionEnd}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shopify-style nav item — parent with optional inline collapsible children
// ═══════════════════════════════════════════════════════════════════════════════

function CollapsibleNavItem({
  item,
  base,
  pathname,
  searchParams,
  isExpanded,
  onToggle,
  badge,
  badgeText,
  collapsed = false,
}: {
  item: NavItem;
  base: string;
  pathname: string;
  searchParams?: string;
  isExpanded: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  /** Plain-text version of the badge for the collapsed-mode tooltip. */
  badgeText?: string;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;
  const isParentActive = doesItemOwnPath(item, pathname, base);
  const href = `${base}${item.href}`;

  const handleClick = useCallback(() => {
    // Parent row click should ALWAYS navigate to its own href. The previous
    // behaviour `e.preventDefault(); onToggle();` left a lead stranded on a
    // sub-page like /chippi/today with no obvious way back to /chippi — the
    // sidebar's "Chippi" row only opened the dropdown.
    //
    // New behaviour: let the <Link> navigate as normal, and additionally
    // ensure the dropdown is open so the lead can see where they are in
    // the tree. If it was already open, leave it open (don't collapse on
    // navigation — collapsing the section the user just navigated into is
    // hostile).
    if (hasChildren && !collapsed && !isExpanded) {
      onToggle();
    }
  }, [hasChildren, collapsed, isExpanded, onToggle]);

  // Dedicated chevron toggle so a lead who wants to expand/collapse the
  // section without navigating still has that escape hatch. Stops the
  // event from bubbling to the parent <Link>.
  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      if (!hasChildren || collapsed) return;
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    },
    [hasChildren, collapsed, onToggle],
  );

  const tooltipLabel = badgeText ? `${item.label} · ${badgeText}` : item.label;

  return (
    <div>
      {/* Parent row — same visual language as FlatNavItem so the realtor
          sidebar (collapsible items with optional children) and the broker
          sidebar (flat items) read as one design. AI items show the chip
          avatar in place of an icon — that's the brand signature. */}
      <CollapsedTooltip enabled={collapsed} label={tooltipLabel}>
        <Link
          href={href}
          onClick={handleClick}
          className={cn(
            'group relative rounded-md text-[13px] transition-colors duration-150',
            collapsed
              ? 'flex items-center justify-center w-10 h-10 mx-auto'
              : 'flex items-center gap-2.5 h-9 pl-3 pr-2.5',
            isParentActive
              ? 'bg-foreground/[0.045] text-foreground font-medium'
              : 'text-foreground/65 hover:bg-foreground/[0.025] hover:text-foreground',
          )}
        >
          {isParentActive && (
            <span
              aria-hidden
              className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-foreground"
            />
          )}
          {item.isAI ? (
            <img
              src="/chip-avatar.png"
              alt=""
              className="w-[16px] h-[16px] rounded-full flex-shrink-0 ring-1 ring-border/40"
            />
          ) : (
            <Icon
              size={15}
              strokeWidth={isParentActive ? 2.25 : 1.75}
              className={cn(
                'flex-shrink-0 transition-colors',
                isParentActive ? 'text-foreground' : 'text-foreground/55 group-hover:text-foreground',
              )}
            />
          )}

          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}

          {!collapsed && badge}

          {!collapsed && hasChildren && (
            <button
              type="button"
              onClick={handleChevronClick}
              aria-label={isExpanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
              aria-expanded={isExpanded}
              className="flex-shrink-0 -mr-1.5 p-1 rounded hover:bg-foreground/[0.04] transition-colors"
            >
              <ChevronRight
                size={11}
                className={cn(
                  'text-muted-foreground/40 transition-transform duration-150',
                  isExpanded && 'rotate-90',
                )}
              />
            </button>
          )}
        </Link>
      </CollapsedTooltip>

      {/* Children — indented, no icons, slightly smaller. Hairline guide.
          Hidden in collapsed mode — there's no room to expand inline. */}
      {hasChildren && !collapsed && (
        <CollapsibleChildren isOpen={isExpanded}>
          <div className="ml-[14px] pl-3 py-1 space-y-px border-l border-border/50">
            {item.children!.map((child) => {
              const childHref = `${base}${child.href}`;
              const childActive = isChildActive(child, pathname, base, searchParams);
              return (
                <Link
                  key={child.href}
                  href={childHref}
                  className={cn(
                    'flex items-center h-7 px-2 rounded text-[12px] transition-colors duration-150',
                    childActive
                      ? 'text-foreground font-medium'
                      : 'text-foreground/55 hover:text-foreground hover:bg-foreground/[0.025]',
                  )}
                >
                  <span className="truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>
        </CollapsibleChildren>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section label (used in broker nav)
// ═══════════════════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  // Empty labels hide entirely so a "label-less" section renders flush.
  if (!children) return null;
  // Uses the canonical SECTION_LABEL token + sidebar-specific spacing so every
  // small-caps grouping label across the app shares one type treatment.
  return (
    <p className={`${SECTION_LABEL} px-3 pt-6 pb-2 select-none`}>
      {children}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Flat nav item (for broker nav, settings sub-pages)
// ═══════════════════════════════════════════════════════════════════════════════

function FlatNavItem({
  href,
  label,
  icon: Icon,
  isActive,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  isActive: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        // 36px row instead of 44px — desktop-mouse driven, not mobile-touch.
        // Tighter row reads as "list of decisions" not "list of items".
        'group relative flex items-center gap-2.5 h-9 pl-3 pr-2.5 rounded-md text-[13px] transition-colors duration-150',
        isActive
          ? 'bg-foreground/[0.045] text-foreground font-medium'
          : 'text-foreground/65 hover:bg-foreground/[0.025] hover:text-foreground',
      )}
    >
      {/* Active accent bar — 2px on the left, foreground tone, rounded
          corner on the inner edge. The signature distinguishing active
          from hover beyond the background tint. */}
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-foreground"
        />
      )}
      <Icon
        size={15}
        strokeWidth={isActive ? 2.25 : 1.75}
        className={cn(
          'flex-shrink-0 transition-colors',
          isActive ? 'text-foreground' : 'text-foreground/55 group-hover:text-foreground',
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Search pill — opens the existing CommandPalette
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quiet "Search · ⌘K" pill below the workspace identity. The CommandPalette
 * (mounted at the layout level) listens for cmd+k / ctrl+k globally; the
 * pill triggers it via a synthetic KeyboardEvent so we don't need to plumb
 * a context. Detects platform for the kbd hint.
 */
function SearchPill({ collapsed = false }: { collapsed?: boolean }) {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  function open() {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: false, bubbles: true }),
    );
  }

  if (collapsed) {
    return (
      <CollapsedTooltip enabled label="Search">
        <button
          type="button"
          onClick={open}
          className="mx-auto flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025] transition-colors duration-150"
          aria-label="Open command palette"
        >
          <Search size={15} className="flex-shrink-0" strokeWidth={1.75} />
        </button>
      </CollapsedTooltip>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="mx-3 flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-md text-[13px] text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025] transition-colors duration-150 group"
      aria-label="Open command palette"
    >
      <Search size={13} className="flex-shrink-0" strokeWidth={1.75} />
      <span className="flex-1 text-left">Search</span>
      <kbd className="text-[10px] tabular-nums bg-foreground/[0.04] group-hover:bg-foreground/[0.06] text-muted-foreground px-1.5 py-0.5 rounded font-mono transition-colors">
        {isMac ? '⌘' : 'Ctrl+'}K
      </kbd>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Workspace switcher
// ═══════════════════════════════════════════════════════════════════════════════

function WorkspaceSwitcher({
  currentName,
  currentSubtitle,
  currentIcon: Icon,
  slug,
  spaceName,
  brokerageMemberships,
  isOnBrokerPage,
  collapsed = false,
}: {
  currentName: string;
  currentSubtitle: string;
  currentIcon: React.ComponentType<{ size?: number; className?: string }>;
  slug: string;
  spaceName: string;
  brokerageMemberships: { id: string; name: string; role: string }[];
  isOnBrokerPage: boolean;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const base = `/s/${slug}`;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Hide the switcher chevron when there's nothing to switch to. Most solo
  // realtors won't have a brokerage; in that case the workspace identity
  // reads as a quiet label, not a teasing dropdown.
  const hasSwitchTargets = brokerageMemberships.length > 0;

  return (
    <div ref={ref} className={cn('relative', collapsed ? 'flex justify-center' : 'mx-3')}>
      <CollapsedTooltip
        enabled={collapsed && !open}
        label={hasSwitchTargets ? `${currentName} · Switch workspace` : currentName}
      >
        <button
          onClick={() => hasSwitchTargets && setOpen(!open)}
          disabled={!hasSwitchTargets}
          className={cn(
            'rounded-md text-left transition-colors',
            collapsed
              ? 'flex items-center justify-center w-9 h-9'
              : 'w-full flex items-center gap-2 px-2.5 py-1.5',
            hasSwitchTargets ? 'hover:bg-foreground/[0.025] cursor-pointer' : 'cursor-default',
          )}
          aria-label={collapsed ? currentName : undefined}
        >
          <div
            className={cn(
              'rounded-md bg-foreground/[0.06] flex items-center justify-center flex-shrink-0',
              collapsed ? 'w-6 h-6' : 'w-6 h-6',
            )}
          >
            <Icon size={12} className="text-foreground/80" />
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate text-foreground leading-tight">
                  {currentName}
                </p>
                <p className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.08em] leading-tight mt-0.5">
                  {currentSubtitle}
                </p>
              </div>
              {hasSwitchTargets && (
                <ChevronsUpDown size={11} className="text-muted-foreground/40 flex-shrink-0" />
              )}
            </>
          )}
        </button>
      </CollapsedTooltip>

      {open && (
        <div
          className={cn(
            'z-50 rounded-lg border bg-popover shadow-lg overflow-hidden',
            collapsed
              ? 'absolute left-full top-0 ml-2 w-64'
              : 'absolute left-0 right-0 top-full mt-1',
          )}
        >
          {slug && (
            <Link
              href={base}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors',
                !isOnBrokerPage && 'bg-accent',
              )}
            >
              <Briefcase size={14} className="text-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{spaceName}</p>
                <p className="text-[10px] text-muted-foreground">My workspace</p>
              </div>
              {!isOnBrokerPage && (
                <Check size={14} className="text-foreground flex-shrink-0" />
              )}
            </Link>
          )}

          {brokerageMemberships.length > 0 && (
            <>
              <div className="border-t border-border" />
              <p className={`${SECTION_LABEL} px-3 pt-2 pb-1`}>
                Brokerages
              </p>
              {brokerageMemberships.map((b) => (
                <Link
                  key={b.id}
                  href="/broker"
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors',
                    isOnBrokerPage && 'bg-accent',
                  )}
                >
                  <Building2 size={14} className="text-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{b.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {b.role === 'broker_owner'
                        ? 'Owner'
                        : b.role === 'broker_admin'
                          ? 'Admin'
                          : 'Member'}
                    </p>
                  </div>
                  {isOnBrokerPage && (
                    <Check size={14} className="text-foreground flex-shrink-0" />
                  )}
                </Link>
              ))}
            </>
          )}

          {brokerageMemberships.length === 0 && !isOnBrokerPage && (
            <>
              <div className="border-t border-border" />
              <Link
                href="/brokerage"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Plus size={14} className="flex-shrink-0" />
                <span>Create or join a brokerage</span>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// User footer
// ═══════════════════════════════════════════════════════════════════════════════

function UserFooter({
  href,
  displayName,
  imageUrl,
  collapsed = false,
}: {
  href: string;
  displayName: string;
  imageUrl?: string | null;
  collapsed?: boolean;
}) {
  // Quiet user identity pinned to the bottom. Mirrors the sidebar's flat row
  // language (h-9, 13px text, subtle hover, foreground left tint on press)
  // so the chip doesn't read as a different surface.
  if (collapsed) {
    return (
      <div className="p-2 flex justify-center">
        <CollapsedTooltip enabled label={displayName}>
          <Link
            href={href}
            className="group flex items-center justify-center w-9 h-9 rounded-md hover:bg-foreground/[0.025] transition-colors duration-150"
            aria-label={displayName}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="w-7 h-7 rounded-full flex-shrink-0 object-cover ring-1 ring-border/50"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-foreground/80 font-semibold text-[11px] flex-shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
        </CollapsedTooltip>
      </div>
    );
  }

  return (
    <div className="p-2">
      <Link
        href={href}
        className="group flex items-center gap-2.5 h-9 pl-1 pr-2.5 rounded-md hover:bg-foreground/[0.025] transition-colors duration-150"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-7 h-7 rounded-full flex-shrink-0 object-cover ring-1 ring-border/50"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-foreground/80 font-semibold text-[11px] flex-shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground truncate leading-tight">
            {displayName}
          </p>
        </div>
        <ChevronRight
          size={11}
          className="flex-shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors"
        />
      </Link>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Realtor nav — 3 sections: AI at top, Workspace in middle, Settings at bottom
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// Edge-handle collapse toggle — a small chevron button that sticks half-off the
// right edge of the realtor sidebar. Discoverable on hover (idle = ghosted,
// rail-hover = solid). Mirrors the Linear / VS Code resize-handle pattern.
// ═══════════════════════════════════════════════════════════════════════════════

function EdgeCollapseHandle() {
  const { collapsed, toggle } = useSidebarCollapsed();
  const Icon = collapsed ? ChevronRight : ChevronLeft;
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        // Position: vertical centre of the rail, half-off the right edge.
        'absolute top-1/2 -right-3 z-30 -translate-y-1/2',
        // Shape: small square with hairline ring + bg matching the page.
        'flex items-center justify-center w-6 h-6 rounded-full',
        'border border-border/70 bg-background text-muted-foreground/70',
        // Visibility: faded by default; full on rail-hover or self-hover.
        'opacity-0 group-hover/rail:opacity-100 hover:opacity-100',
        'hover:text-foreground hover:bg-foreground/[0.04]',
        'transition-opacity duration-150 active:scale-[0.94]',
        // Subtle shadow so the handle reads as on top of the rail edge.
        'shadow-sm shadow-foreground/[0.04]',
      )}
    >
      <Icon size={12} strokeWidth={2} />
    </button>
  );
}

function RealtorNav({
  slug,
  base,
  pathname,
  searchParamsString,
  unreadLeadCount,
  overdueFollowUpCount,
  pendingDraftCount,
  activePropertyCount,
}: {
  slug: string;
  base: string;
  pathname: string;
  searchParamsString: string;
  unreadLeadCount: number;
  overdueFollowUpCount: number;
  pendingDraftCount: number;
  activePropertyCount: number;
}) {
  const { collapsed } = useSidebarCollapsed();
  const settingsItem = realtorNavItems.find((item) => item.href === '/settings')!;
  const isOnSettings = doesItemOwnPath(settingsItem, pathname, base);
  const [settingsExpanded, setSettingsExpanded] = useState(isOnSettings);

  // Expandable key for main items that have children (e.g. Intake form, Analytics)
  const getInitialExpandedKey = () => {
    for (const item of realtorNavItems) {
      if (item.children && item.href !== '/settings' && doesItemOwnPath(item, pathname, base)) {
        return item.href;
      }
    }
    return null;
  };
  const [expandedKey, setExpandedKey] = useState<string | null>(getInitialExpandedKey);

  useEffect(() => {
    if (isOnSettings) setSettingsExpanded(true);
  }, [isOnSettings]);

  // Auto-expand when navigating into a child route
  useEffect(() => {
    for (const item of realtorNavItems) {
      if (item.children && item.href !== '/settings' && doesItemOwnPath(item, pathname, base)) {
        setExpandedKey(item.href);
        return;
      }
    }
  }, [pathname, base]);

  // AI-related items always sit at the top
  const aiItems = realtorNavItems.filter((item) => item.isAI);
  // Everything else except AI and settings
  const mainItems = realtorNavItems.filter(
    (item) => !item.isAI && item.href !== '/settings',
  );

  const getBadge = (item: NavItem): React.ReactNode => {
    if (item.badgeKey === 'leads' && unreadLeadCount > 0) {
      return (
        <span className="inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-medium tabular-nums flex-shrink-0 bg-secondary text-muted-foreground">
          <PulseNumber value={unreadLeadCount > 99 ? '99+' : unreadLeadCount} />
        </span>
      );
    }
    if (item.badgeKey === 'pendingDrafts' && pendingDraftCount > 0) {
      return (
        <span className="inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums flex-shrink-0 bg-primary text-primary-foreground">
          <PulseNumber value={pendingDraftCount > 99 ? '99+' : pendingDraftCount} />
        </span>
      );
    }
    if (item.badgeKey === 'properties' && activePropertyCount > 0) {
      return (
        <span className="inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-medium tabular-nums flex-shrink-0 bg-secondary text-muted-foreground">
          <PulseNumber value={activePropertyCount > 99 ? '99+' : activePropertyCount} />
        </span>
      );
    }
    return undefined;
  };

  const getBadgeText = (item: NavItem): string | undefined => {
    if (item.badgeKey === 'leads' && unreadLeadCount > 0) {
      return unreadLeadCount > 99 ? '99+' : String(unreadLeadCount);
    }
    if (item.badgeKey === 'pendingDrafts' && pendingDraftCount > 0) {
      return pendingDraftCount > 99 ? '99+' : String(pendingDraftCount);
    }
    if (item.badgeKey === 'properties' && activePropertyCount > 0) {
      return activePropertyCount > 99 ? '99+' : String(activePropertyCount);
    }
    return undefined;
  };

  const renderItem = (item: NavItem) => {
    const hasChildren = !!(item.children && item.children.length > 0);
    return (
      <CollapsibleNavItem
        key={item.href}
        item={item}
        base={base}
        pathname={pathname}
        searchParams={searchParamsString}
        isExpanded={hasChildren ? expandedKey === item.href : false}
        onToggle={hasChildren ? () => setExpandedKey((p) => (p === item.href ? null : item.href)) : () => {}}
        badge={getBadge(item)}
        badgeText={getBadgeText(item)}
        collapsed={collapsed}
      />
    );
  };

  return (
    <nav
      className={cn(
        'flex-1 py-2 overflow-y-auto space-y-3',
        collapsed ? 'px-1' : 'px-3',
      )}
    >
      {/* Primary nav — daily destinations. AI item rides up top via the
          existing renderItem treatment; no section label needed when there
          are only a handful of primaries. */}
      <div>
        <div className="space-y-0.5">
          {aiItems.map(renderItem)}
          {mainItems.map(renderItem)}
        </div>
      </div>

      {/* Context-aware second section. Route IS the signal:
            - On /chippi/* → conversation list (expanded) or History icon
              link (collapsed rail). Modern chat apps surface chat history
              in their nav for a reason — you came back to find a thread.
            - Elsewhere → render `realtorMoreNavItems` if it has anything.
              It's intentionally empty today, but kept as the slot for
              future secondary nav without re-plumbing the layout.
          The previous Chats/Pages tab toggle was ceremony — Pages was
          empty so flipping to it dead-ended. Removed. */}
      {(() => {
        const onChippi = pathname.startsWith(`/s/${slug}/chippi`);
        const hasMore = realtorMoreNavItems.length > 0;
        if (!onChippi && !hasMore) return null;
        return (
          <div>
            {collapsed ? (
              <>
                {onChippi && (
                  <>
                    <div className="my-2 mx-2 h-px bg-border/50" aria-hidden />
                    <CollapsedTooltip enabled label="Conversations">
                      <Link
                        href={`/s/${slug}/chippi?view=history`}
                        aria-label="Conversation history"
                        className="group relative flex items-center justify-center w-10 h-10 mx-auto rounded-md text-foreground/65 hover:bg-foreground/[0.025] hover:text-foreground transition-colors duration-150"
                      >
                        <History size={15} strokeWidth={1.75} />
                      </Link>
                    </CollapsedTooltip>
                  </>
                )}
                {hasMore && (
                  <div className="space-y-0.5">{realtorMoreNavItems.map(renderItem)}</div>
                )}
              </>
            ) : (
              <>
                {onChippi && <SidebarConversations slug={slug} />}
                {hasMore && (
                  <div className={cn('space-y-0.5', onChippi && 'mt-4')}>
                    {realtorMoreNavItems.map(renderItem)}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Settings — collapsible, pinned at bottom of scroll area */}
      <div className="pt-1">
        <CollapsibleNavItem
          item={settingsItem}
          base={base}
          pathname={pathname}
          searchParams={searchParamsString}
          isExpanded={settingsExpanded}
          onToggle={() => setSettingsExpanded((p) => !p)}
          collapsed={collapsed}
        />
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Sidebar export
// ═══════════════════════════════════════════════════════════════════════════════

export function Sidebar({
  slug,
  spaceName,
  unreadLeadCount,
  pendingDraftCount = 0,
  overdueFollowUpCount = 0,
  activePropertyCount = 0,
  isBroker = false,
  isBrokerOnly = false,
  brokerageName = null,
  brokerageRole = null,
  brokerageMemberships = [],
}: SidebarProps) {
  const pathname = usePathname();
  // Read search params and keep in sync with URL changes
  const [searchParamsString, setSearchParamsString] = useState('');
  useEffect(() => {
    const updateParams = () => {
      setSearchParamsString(window.location.search.replace('?', ''));
    };
    updateParams();
    // Listen for popstate (back/forward) and custom pushState/replaceState
    window.addEventListener('popstate', updateParams);
    // Poll briefly to catch Next.js soft navigations that change query params
    const interval = setInterval(updateParams, 300);
    return () => {
      window.removeEventListener('popstate', updateParams);
      clearInterval(interval);
    };
  }, [pathname]);
  const base = `/s/${slug}`;
  const { user } = useUser();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'My Account'
    : 'My Account';

  const isOnBrokerPage = pathname.startsWith('/broker');
  const isOnBrokerSettings = pathname.startsWith('/broker/settings');

  // ── Broker settings sub-nav ──────────────────────────────────────────────
  if (isBroker && (isOnBrokerPage || isBrokerOnly) && isOnBrokerSettings) {
    return (
      <aside className="hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border/70 shrink-0">
        <div className="px-4 pt-5 pb-3">
          <BrandLogo className="h-5" alt="Chippi" />
        </div>

        <div className="px-3 pb-1">
          <Link
            href="/broker"
            className="group flex items-center gap-2 h-9 px-2.5 rounded-md text-[13px] font-medium transition-colors duration-150 text-muted-foreground hover:bg-foreground/[0.025] hover:text-foreground"
          >
            <ArrowLeft size={13} strokeWidth={1.75} className="flex-shrink-0" />
            <span>Back to team</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
          {brokerSettingsNavSections.map((section) => (
            <div key={section.label}>
              <SectionLabel>{section.label}</SectionLabel>
              {section.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <FlatNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={isActive}
                  />
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mx-4 border-t border-border" />
        <UserFooter
          href={slug ? `${base}/profile` : '/broker/settings'}
          displayName={displayName}
          imageUrl={user?.imageUrl}
        />
      </aside>
    );
  }

  // ── Broker sidebar ───────────────────────────────────────────────────────
  if (isBroker && (isOnBrokerPage || isBrokerOnly)) {
    return (
      <aside className="relative hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border/70 shrink-0 overflow-hidden">
        {/* Same brand-warm tint as the realtor sidebar so brokers see the
            same identity when they switch workspaces. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-orange-50/60 via-orange-50/20 to-transparent dark:from-orange-500/[0.04] dark:via-transparent"
        />
        <div className="relative z-10 flex flex-col h-full">
          <div className="px-4 pt-5 pb-3">
            <BrandLogo className="h-5" alt="Chippi" />
          </div>

          <WorkspaceSwitcher
            currentName={brokerageName ?? 'Brokerage'}
            currentSubtitle="Brokerage"
            currentIcon={Building2}
            slug={slug}
            spaceName={spaceName}
            brokerageMemberships={brokerageMemberships}
            isOnBrokerPage={isOnBrokerPage}
          />

          <div className="mt-3">
            <SearchPill />
          </div>

          <nav className="flex-1 px-3 pb-2 mt-1 space-y-0.5 overflow-y-auto">
          {(brokerageRole === 'realtor_member'
            ? brokerMemberNavSections
            : brokerAdminNavSections
          ).map((section) => {
            const visibleItems = section.items.filter(
              (item) =>
                !item.adminOnly ||
                brokerageRole === 'broker_owner' ||
                brokerageRole === 'broker_admin',
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label}>
                <SectionLabel>{section.label}</SectionLabel>
                {visibleItems.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  const highlightBadge =
                    'highlight' in item &&
                    (item as any).highlight &&
                    !isActive ? (
                      <span className="inline-flex h-2 w-2 rounded-full bg-lead-hot shrink-0" />
                    ) : undefined;
                  return (
                    <FlatNavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      isActive={isActive}
                      badge={highlightBadge}
                    />
                  );
                })}
              </div>
            );
          })}
        </nav>

          <div className="border-t border-border/50" />
          <UserFooter
            href={slug ? `${base}/profile` : '/broker/settings'}
            displayName={displayName}
            imageUrl={user?.imageUrl}
          />
        </div>
      </aside>
    );
  }

  // ── Realtor workspace sidebar ────────────────────────────────────────────
  return (
    <SidebarCollapseProvider>
      <RealtorSidebarShell
        slug={slug}
        spaceName={spaceName}
        base={base}
        pathname={pathname}
        searchParamsString={searchParamsString}
        unreadLeadCount={unreadLeadCount}
        overdueFollowUpCount={overdueFollowUpCount}
        pendingDraftCount={pendingDraftCount}
        activePropertyCount={activePropertyCount}
        brokerageMemberships={brokerageMemberships}
        isOnBrokerPage={isOnBrokerPage}
        displayName={displayName}
        imageUrl={user?.imageUrl}
      />
    </SidebarCollapseProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Realtor sidebar shell — consumes the collapse context so all subcomponents
// can react to width changes via `useSidebarCollapsed()`. The aside container
// transitions width only on user-toggle (not on initial hydration).
// ═══════════════════════════════════════════════════════════════════════════════

function RealtorSidebarShell({
  slug,
  spaceName,
  base,
  pathname,
  searchParamsString,
  unreadLeadCount,
  overdueFollowUpCount,
  pendingDraftCount,
  activePropertyCount,
  brokerageMemberships,
  isOnBrokerPage,
  displayName,
  imageUrl,
}: {
  slug: string;
  spaceName: string;
  base: string;
  pathname: string;
  searchParamsString: string;
  unreadLeadCount: number;
  overdueFollowUpCount: number;
  pendingDraftCount: number;
  activePropertyCount: number;
  brokerageMemberships: { id: string; name: string; role: string }[];
  isOnBrokerPage: boolean;
  displayName: string;
  imageUrl?: string | null;
}) {
  const { collapsed } = useSidebarCollapsed();

  return (
    <aside
      className={cn(
        'group/rail relative hidden md:flex flex-col h-full bg-sidebar border-r border-border/70 shrink-0',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[56px]' : 'w-[240px]',
      )}
    >
      {/* Edge-handle collapse toggle — sticks half-off the right edge of the
          rail so it's discoverable without crowding the nav. Idle = nearly
          invisible (subtle ring), on rail-hover = visible. Click flips
          collapsed state via the existing context. */}
      <EdgeCollapseHandle />
      {/* Brand-warm tint at top — clip width follows the rail so the orange
          wash doesn't hint at content beyond the visible edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-orange-50/60 via-orange-50/20 to-transparent dark:from-orange-500/[0.04] dark:via-transparent"
      />

      <div className="relative z-10 flex flex-col h-full">
        {/* Brand mark — small, monochrome, sets identity without dominating.
            In collapsed mode the BrandLogo is already an icon-tight mark; we
            just center it on the rail. */}
        <div
          className={cn(
            'pt-5 pb-3',
            collapsed ? 'flex justify-center px-2' : 'px-4',
          )}
        >
          <BrandLogo className="h-5" alt="Chippi" />
        </div>

        {/* Workspace identity (with switcher when there's somewhere to go) */}
        <WorkspaceSwitcher
          currentName={spaceName}
          currentSubtitle="Solo realtor"
          currentIcon={Briefcase}
          slug={slug}
          spaceName={spaceName}
          brokerageMemberships={brokerageMemberships}
          isOnBrokerPage={isOnBrokerPage}
          collapsed={collapsed}
        />

        {/* Search */}
        <div className="mt-3">
          <SearchPill collapsed={collapsed} />
        </div>

        {/* Cockpit instrument — live agent readout (working / idle / paused) */}
        <ChippiInstrument collapsed={collapsed} />

        {/* Primary nav + More + Settings */}
        <RealtorNav
          slug={slug}
          base={base}
          pathname={pathname}
          searchParamsString={searchParamsString}
          unreadLeadCount={unreadLeadCount}
          overdueFollowUpCount={overdueFollowUpCount}
          pendingDraftCount={pendingDraftCount}
          activePropertyCount={activePropertyCount}
        />

        {/* User footer pinned at bottom, separated by a hairline. The
            collapse toggle now lives as an edge-handle on the right rail
            (see EdgeCollapseHandle above) — discoverable on hover. */}
        <div className="border-t border-border/50" />
        <UserFooter
          href={`${base}/settings?tab=profile`}
          displayName={displayName}
          imageUrl={imageUrl}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}
