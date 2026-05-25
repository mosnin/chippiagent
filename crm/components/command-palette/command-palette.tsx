'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Home,
  Users,
  Briefcase,
  Calendar,
  FileText,
  BarChart2,
  MessageCircle,
  Settings,
  Search as SearchIcon,
  Plus,
  ArrowRight,
  MessageSquare,
  UserPlus,
  PhoneCall,
  Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type PaletteAction =
  | { kind: 'route'; id: string; label: string; icon: typeof Home; href: string; group: string }
  | { kind: 'ask'; id: string; label: string; query: string; group: string }
  | { kind: 'search-contact'; id: string; label: string; sublabel: string; href: string; group: string }
  | { kind: 'search-deal'; id: string; label: string; sublabel: string; href: string; group: string };

interface Props {
  slug: string;
}

/**
 * Universal command palette. Triggered with ⌘K / Ctrl-K from anywhere inside
 * the /s/:slug layout.
 *
 *   - Nav actions are static (Today, People, Deals, …).
 *   - Create actions route to the create-deal / add-contact / schedule-tour
 *     flows the app already has (keeping the palette a router, not its own
 *     subsystem — easier to maintain).
 *   - Search actions hit /api/contacts and /api/deals/search when the query
 *     looks substantive (2+ chars) and the user has paused typing briefly.
 *
 * No third-party library (cmdk, fuse.js, etc.) — the list is small enough
 * that a plain `.filter(includes)` over static actions is instant, and
 * server-side search handles the variable data.
 */
export function CommandPalette({ slug }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [remote, setRemote] = useState<PaletteAction[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = `/s/${slug}`;

  // Static actions — nav + quick create.
  const staticActions: PaletteAction[] = useMemo(() => [
    // Navigate
    { kind: 'route', id: 'nav-today',    group: 'Navigate', label: 'Today',     icon: Home,         href: `${base}` },
    { kind: 'route', id: 'nav-people',   group: 'Navigate', label: 'People',    icon: Users,        href: `${base}/contacts` },
    { kind: 'route', id: 'nav-new-leads',group: 'Navigate', label: 'New leads', icon: Users,        href: `${base}/leads` },
    { kind: 'route', id: 'nav-deals',    group: 'Navigate', label: 'Deals',     icon: Briefcase,    href: `${base}/deals` },
    { kind: 'route', id: 'nav-calendar', group: 'Navigate', label: 'Calendar',  icon: Calendar,     href: `${base}/calendar` },
    { kind: 'route', id: 'nav-analytics',group: 'Navigate', label: 'Analytics', icon: BarChart2,    href: `${base}/analytics` },
    { kind: 'route', id: 'nav-commissions', group: 'Navigate', label: 'Commissions', icon: BarChart2, href: `${base}/properties/commissions` },
    { kind: 'route', id: 'nav-integrations', group: 'Navigate', label: 'Integrations', icon: Plug, href: `${base}/integrations` },
    { kind: 'route', id: 'nav-assistant',group: 'Navigate', label: 'Assistant', icon: MessageCircle,     href: `${base}/ai` },
    { kind: 'route', id: 'nav-drafts',   group: 'Navigate', label: 'AI drafts', icon: MessageCircle,     href: `${base}/agent` },
    { kind: 'route', id: 'nav-settings', group: 'Navigate', label: 'Settings',  icon: Settings,     href: `${base}/settings` },
    { kind: 'route', id: 'nav-templates',group: 'Navigate', label: 'Message templates', icon: MessageSquare, href: `${base}/settings?tab=apps` },

    // Create
    { kind: 'route', id: 'new-deal',    group: 'Create', label: 'New deal',      icon: Plus,      href: `${base}/deals/new` },
    { kind: 'route', id: 'new-contact', group: 'Create', label: 'Add contact',   icon: UserPlus,  href: `${base}/contacts` },
    { kind: 'route', id: 'new-tour',    group: 'Create', label: 'Schedule tour', icon: PhoneCall, href: `${base}/calendar` },
  ], [base]);

  // Global shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus input + reset state on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setRemote([]);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Remote search: contacts + deals, debounced.
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!open || query.trim().length < 2) { setRemote([]); return; }

    searchRef.current = setTimeout(async () => {
      try {
        // /api/search returns { contacts, deals, tours } in one call.
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) { setRemote([]); return; }
        const payload = await res.json() as {
          contacts?: { id: string; name: string; email?: string | null; phone?: string | null }[];
          deals?: { id: string; title: string; address?: string | null }[];
        };
        const next: PaletteAction[] = [];
        for (const c of (payload.contacts ?? []).slice(0, 6)) {
          next.push({
            kind: 'search-contact',
            id: `contact-${c.id}`,
            group: 'People',
            label: c.name,
            sublabel: c.email || c.phone || '',
            href: `${base}/contacts/${c.id}`,
          });
        }
        for (const d of (payload.deals ?? []).slice(0, 6)) {
          next.push({
            kind: 'search-deal',
            id: `deal-${d.id}`,
            group: 'Deals',
            label: d.title,
            sublabel: d.address ?? '',
            href: `${base}/deals/${d.id}`,
          });
        }
        setRemote(next);
      } catch {
        setRemote([]);
      }
    }, 200);

    return () => {
      if (searchRef.current) clearTimeout(searchRef.current);
    };
  }, [query, open, slug, base]);

  // Filter static actions against the query
  const filtered = useMemo(() => {
    const q = query.trim();
    const ql = q.toLowerCase();
    const matches = (s: string) => s.toLowerCase().includes(ql);
    const filteredStatic = ql === '' ? staticActions : staticActions.filter((a) => matches(a.label));

    // Dynamic "Ask assistant" entry whenever there's a substantive query —
    // placed first so cmd+k doubles as a quick way to fire a prompt.
    const askItems: PaletteAction[] = q.length >= 2 ? [{
      kind: 'ask',
      id: 'ask-assistant',
      group: 'Ask',
      label: `Ask assistant: "${q}"`,
      query: q,
    }] : [];

    return [...askItems, ...filteredStatic, ...remote];
  }, [staticActions, remote, query]);

  // Reset active index when results change
  useEffect(() => { setActiveIndex(0); }, [filtered.length]);

  const run = useCallback((action: PaletteAction) => {
    setOpen(false);
    if (action.kind === 'ask') {
      router.push(`${base}/ai?q=${encodeURIComponent(action.query)}`);
    } else {
      router.push(action.href);
    }
  }, [router, base]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const action = filtered[activeIndex];
      if (action) run(action);
    }
  }

  if (!open) return null;

  // Group by `group` field while preserving order.
  const grouped: { group: string; items: PaletteAction[] }[] = [];
  for (const a of filtered) {
    const last = grouped[grouped.length - 1];
    if (last && last.group === a.group) last.items.push(a);
    else grouped.push({ group: a.group, items: [a] });
  }

  let running = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[640px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <SearchIcon size={16} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Jump to, search, or ask your assistant…"
            className="flex-1 bg-transparent outline-none text-sm py-3"
          />
          <kbd className="hidden sm:inline-block text-[11px] font-mono bg-muted text-muted-foreground rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No matches
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.group}>
                <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.group}
                </p>
                {g.items.map((action) => {
                  running += 1;
                  const idx = running;
                  const active = idx === activeIndex;
                  const Icon = action.kind === 'route' ? action.icon :
                               action.kind === 'ask' ? MessageCircle :
                               action.kind === 'search-deal' ? Briefcase : Users;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => run(action)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                        active ? 'bg-muted' : 'hover:bg-muted/40',
                      )}
                    >
                      <Icon size={15} className={cn('flex-shrink-0', active ? 'text-foreground' : 'text-muted-foreground')} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm truncate', active ? 'font-semibold' : 'font-medium')}>{action.label}</p>
                        {'sublabel' in action && action.sublabel && (
                          <p className="text-[11px] text-muted-foreground truncate">{action.sublabel}</p>
                        )}
                      </div>
                      {active && <ArrowRight size={12} className="text-muted-foreground flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono bg-muted rounded px-1">↑</kbd> <kbd className="font-mono bg-muted rounded px-1">↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-muted rounded px-1">↵</kbd> select</span>
          </div>
          <span><kbd className="font-mono bg-muted rounded px-1">⌘K</kbd> to toggle</span>
        </div>
      </div>
    </div>
  );
}
