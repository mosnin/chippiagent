'use client';

/**
 * Connected apps panel for /settings.
 *
 * Lists every integration in the catalog with one of three states:
 *   - active   → green dot + "Disconnect" link
 *   - expired  → amber dot + "Reconnect" link
 *   - none     → "Connect" pill
 *
 * The realtor sees one row per app. Connect → OAuth at the provider →
 * Composio sends them back to /integrations/callback → row appears
 * connected. Disconnect → one tap, no confirm. Reconnect = disconnect
 * + connect, but the realtor sees one tap.
 *
 * Categories are guidance, not a filter dropdown — they help the
 * realtor scan, not configure.
 *
 * Health badges: after the connection list loads, we fire a separate
 * non-blocking fetch to /api/integrations/health so each connected row
 * shows a live status badge (healthy / expired / error / disconnected).
 * The badge refreshes on window focus — stale auth shows up the moment
 * the realtor comes back to the tab, not just when they next open a chat.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAPTION, BODY_MUTED } from '@/lib/typography';
import {
  INTEGRATIONS,
  integrationsByCategory,
  type IntegrationApp,
  type IntegrationCategory,
} from '@/lib/integrations/catalog';

interface ConnectionRow {
  id: string;
  toolkit: string;
  status: 'active' | 'expired' | 'failed';
  label: string | null;
  lastError: string | null;
}

// ── Health badge types ────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'expired' | 'error' | 'disconnected';

interface ConnectionHealth {
  toolkit: string;
  name: string;
  status: HealthStatus;
  lastCheckedAt: string;
  error?: string;
}

/**
 * IntegrationHealthBadge — client component that shows the live Composio
 * connection status for a single integration.
 *
 * Props are pushed down from ConnectedAppsSection which owns the fetch.
 * Loading state is a pulsing dot skeleton; the badge never blocks render.
 */
function IntegrationHealthBadge({
  health,
  loading,
}: {
  health: ConnectionHealth | null | undefined;
  loading: boolean;
}) {
  if (loading) {
    // Skeleton: animate-pulse dot only — don't show stale text.
    return (
      <span className="inline-flex items-center gap-1.5" aria-label="Checking status">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-pulse" aria-hidden />
      </span>
    );
  }

  if (!health) return null;

  const { status, error } = health;

  const dotClass =
    status === 'healthy'
      ? 'bg-green-500'
      : status === 'expired'
        ? 'bg-yellow-500'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-muted-foreground/40'; // disconnected

  const label =
    status === 'healthy'
      ? 'Connected'
      : status === 'expired'
        ? 'Auth expired'
        : status === 'error'
          ? 'Connection error'
          : 'Not connected';

  const textClass =
    status === 'healthy'
      ? 'text-green-600 dark:text-green-400'
      : status === 'expired'
        ? 'text-yellow-600 dark:text-yellow-400'
        : status === 'error'
          ? 'text-red-600 dark:text-red-400'
          : 'text-muted-foreground';

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={error ?? label}
      aria-label={label}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} aria-hidden />
      <span className={cn('text-xs', textClass)}>{label}</span>
    </span>
  );
}

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  email: 'Email',
  messaging: 'Messaging',
  calendar: 'Calendar',
  docs: 'Documents',
  crm: 'CRM',
  'real-estate': 'Real estate',
  social: 'Social',
  ads: 'Ads',
  payments: 'Payments',
  'docs-sign': 'Signatures',
  tasks: 'Tasks',
  forms: 'Forms',
  video: 'Video',
  storage: 'Storage',
};

const CATEGORY_ORDER: IntegrationCategory[] = [
  'email',
  'messaging',
  'calendar',
  'crm',
  'real-estate',
  'social',
  'ads',
  'payments',
  'docs',
  'docs-sign',
  'tasks',
  'forms',
  'video',
  'storage',
];

export interface CallbackResult {
  /** True when Composio said the connection succeeded. */
  ok: boolean;
  /** Composio's status string when ok=false (e.g. "ACTIVE", "FAILED",
   *  "missing_account", "unknown_toolkit", "Auth_Config_NotFound"). */
  reason: string | null;
  /** The toolkit slug Composio attempted to connect (gmail, slack, …). */
  toolkit: string | null;
}

/**
 * Translate the raw `reason` string from the OAuth callback into a sentence
 * the realtor can act on. Composio errors like `Auth_Config_NotFound` are
 * meaningless to a non-engineer — we map them to "set up the auth config in
 * the Composio dashboard" so the realtor knows where to go.
 */
function explainCallbackReason(reason: string | null, toolkit: string | null): string {
  const tk = toolkit ? ` (${toolkit})` : '';
  if (!reason) return `Connection didn't complete${tk}. Try again.`;
  const r = reason.toLowerCase();
  if (r === 'missing_account')
    return `Composio didn't return a connection id${tk}. The OAuth flow may have been cancelled.`;
  if (r === 'no_space')
    return `We couldn't resolve your workspace. Sign out and back in, then retry.`;
  if (r === 'unknown_toolkit' || r === 'unsupported_toolkit')
    return `That integration isn't in the supported catalog yet${tk}.`;
  if (r === 'persist_failed')
    return `OAuth completed but we couldn't save the connection${tk}. Try once more.`;
  if (r.includes('auth_config_not_found') || r.includes('auth config'))
    return `${toolkit ?? 'That toolkit'} needs an Auth Config in your Composio dashboard. Open Composio → Authentication management → Create Auth Config for ${toolkit ?? 'the toolkit'}, then come back.`;
  if (r.includes('failed') || r.includes('expired') || r.includes('error'))
    return `Composio reported "${reason}"${tk}. Check the Composio dashboard for the connection status.`;
  // Pass through anything else verbatim — better than guessing.
  return `${reason}${tk}`;
}

interface SetupHealth {
  apiKeySet: boolean;
  appUrlSet: boolean;
  callbackUrl: string | null;
}

export function ConnectedAppsSection({ callbackResult }: { callbackResult?: CallbackResult | null } = {}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [setup, setSetup] = useState<SetupHealth | null>(null);
  const [busyToolkit, setBusyToolkit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Auto-clear the callback banner when the realtor dismisses it. Persisted
  // in component state — refreshing the page brings it back via searchParams,
  // which is the right behaviour (the banner reflects the URL, not history).
  const [callbackDismissed, setCallbackDismissed] = useState(false);

  // Health state: null = not yet fetched, true = loading, false = loaded/failed.
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthByToolkit, setHealthByToolkit] = useState<Map<string, ConnectionHealth>>(
    new Map(),
  );

  useEffect(() => {
    void fetchConnections();
  }, []);

  async function fetchConnections() {
    try {
      const res = await fetch('/api/integrations');
      if (!res.ok) {
        setConfigured(false);
        return;
      }
      const data = (await res.json()) as {
        configured: boolean;
        setup?: SetupHealth;
        connections: ConnectionRow[];
      };
      setConfigured(data.configured);
      setSetup(data.setup ?? null);
      setConnections(data.connections);
    } catch {
      setConfigured(false);
    }
  }

  // fetchHealth is intentionally non-blocking — it updates the health badges
  // after the connections list is already on screen.
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/integrations/health');
      if (!res.ok) return;
      const data = (await res.json()) as { connections: ConnectionHealth[] };
      const map = new Map<string, ConnectionHealth>();
      for (const h of data.connections) {
        map.set(h.toolkit, h);
      }
      setHealthByToolkit(map);
    } catch {
      // Health fetch failure is silent — the dot just won't render.
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Fetch health on mount and whenever the window regains focus.
  // This catches stale auth that expires while the realtor is away.
  useEffect(() => {
    void fetchHealth();

    const onFocus = () => void fetchHealth();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchHealth]);

  async function handleConnect(toolkit: string) {
    setBusyToolkit(toolkit);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/connect/${toolkit}`, {
        method: 'POST',
      });
      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) {
        setError(data.error ?? `Could not start connect for ${toolkit}.`);
        setBusyToolkit(null);
        return;
      }
      // Hand off to the provider's OAuth screen. Composio sends them back
      // to /integrations/callback, which redirects to /settings#integrations
      // and we re-fetch on mount.
      window.location.assign(data.redirectUrl);
    } catch {
      setError(`Could not reach the integrations service.`);
      setBusyToolkit(null);
    }
  }

  async function handleDisconnect(connectionId: string) {
    setBusyToolkit(connectionId);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/${connectionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError('Could not disconnect.');
        setBusyToolkit(null);
        return;
      }
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
    } catch {
      setError('Could not disconnect.');
    } finally {
      setBusyToolkit(null);
    }
  }

  const byToolkit = useMemo(() => {
    const map = new Map<string, ConnectionRow>();
    for (const c of connections) {
      const existing = map.get(c.toolkit);
      // Prefer 'active', then 'expired', then 'failed'.
      if (
        !existing ||
        rank(c.status) > rank(existing.status)
      ) {
        map.set(c.toolkit, c);
      }
    }
    return map;
  }, [connections]);

  const grouped = integrationsByCategory();

  if (configured === false) {
    // Replace the silent "not configured" line with an actionable checklist —
    // the realtor (or their dev) needs to know exactly which env var is
    // missing on Vercel and where to grab the value. Silent state was the
    // most-reported integrations bug.
    return (
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 p-5 space-y-3">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Integrations aren&apos;t configured yet.
        </p>
        <ol className="text-sm text-amber-900/90 dark:text-amber-100/90 list-decimal list-inside space-y-1.5 leading-relaxed">
          <li>
            Set <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-[12px] font-mono">COMPOSIO_API_KEY</code> on Vercel (Settings → Environment Variables → Production + Preview). Grab the key from the Composio dashboard → Settings.
          </li>
          <li>
            Set <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-[12px] font-mono">NEXT_PUBLIC_APP_URL</code> to your production URL — the OAuth callback uses it.
          </li>
          <li>
            In the Composio dashboard, enable each toolkit you want (Gmail, Slack, Calendar, …) AND create an Auth Config under Authentication management. Just enabling the toolkit isn&apos;t enough — without the Auth Config, connection initiation fails.
          </li>
          <li>Redeploy. Env-var changes don&apos;t apply to existing deploys.</li>
        </ol>
      </div>
    );
  }

  // Configured, but the callback URL env var is missing — this is the silent
  // killer the audit identified: OAuth completes, Composio redirects to a
  // default URL, the realtor never lands back in the app and the connection
  // never persists. Surface it loud.
  const showAppUrlWarning = setup && setup.apiKeySet && !setup.appUrlSet;
  const showCallbackBanner = callbackResult && !callbackDismissed;

  return (
    <div className="space-y-8">
      {/* OAuth callback banner — green on success, amber on failure. The
          previous build silently dropped these results so the realtor never
          knew the connection had failed; now the failure reason gets
          translated to a sentence they can act on. */}
      {showCallbackBanner && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'rounded-lg border px-4 py-3 flex items-start gap-3',
            callbackResult!.ok
              ? 'border-green-300/60 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-100'
              : 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'mt-1 w-2 h-2 rounded-full flex-shrink-0',
              callbackResult!.ok ? 'bg-green-500' : 'bg-amber-500',
            )}
          />
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-medium">
              {callbackResult!.ok
                ? `${callbackResult!.toolkit ? `${callbackResult!.toolkit}` : 'Integration'} connected.`
                : "Couldn't connect."}
            </p>
            {!callbackResult!.ok && (
              <p className="mt-1 text-[13px] leading-relaxed opacity-90">
                {explainCallbackReason(callbackResult!.reason, callbackResult!.toolkit)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCallbackDismissed(true)}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {showAppUrlWarning && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 leading-relaxed">
          <p className="font-medium">
            <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-[12px] font-mono">NEXT_PUBLIC_APP_URL</code> isn&apos;t set.
          </p>
          <p className="mt-1 opacity-90">
            New connections will OAuth at the provider but won&apos;t make it back to this app — Composio redirects to its default URL instead. Set <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-[12px] font-mono">NEXT_PUBLIC_APP_URL</code> to your production domain on Vercel and redeploy.
          </p>
        </div>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const apps = grouped[cat];
        if (!apps || apps.length === 0) return null;
        return (
          <div key={cat} className="space-y-3">
            <p className={CAPTION}>{CATEGORY_LABEL[cat]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {apps.map((app) => {
                const connection = byToolkit.get(app.toolkit) ?? null;
                const showHealth = Boolean(connection) && !app.comingSoon;
                return (
                  <IntegrationCard
                    key={app.toolkit}
                    app={app}
                    connection={connection}
                    busy={busyToolkit === app.toolkit || busyToolkit === byToolkit.get(app.toolkit)?.id}
                    health={showHealth ? (healthByToolkit.get(app.toolkit) ?? null) : null}
                    healthLoading={showHealth && healthLoading}
                    onConnect={() => handleConnect(app.toolkit)}
                    onDisconnect={() => {
                      const c = byToolkit.get(app.toolkit);
                      if (c) void handleDisconnect(c.id);
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <p className={CAPTION}>
        Connections are scoped to this workspace. Disconnect anytime —
        Chippi stops using the app on the next message.
      </p>
    </div>
  );
}

function rank(status: ConnectionRow['status']): number {
  if (status === 'active') return 3;
  if (status === 'expired') return 2;
  return 1; // failed
}

function AppIcon({ app }: { app: IntegrationApp }) {
  if (app.iconUrl) {
    return (
      <img
        src={app.iconUrl}
        alt=""
        aria-hidden
        className="w-8 h-8 object-contain flex-shrink-0"
      />
    );
  }
  // Fallback: first-letter circle in neutral chrome. Identifies the row
  // without faking a brand mark we don't have.
  return (
    <span
      aria-hidden
      className="w-8 h-8 rounded-md bg-muted text-muted-foreground inline-flex items-center justify-center text-sm font-semibold flex-shrink-0"
    >
      {app.name[0]}
    </span>
  );
}

function StatusPill({
  status,
  comingSoon,
}: {
  status: ConnectionRow['status'] | null;
  comingSoon?: boolean;
}) {
  if (comingSoon) return null;
  if (status === 'active')
    return (
      <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
        Connected
      </span>
    );
  if (status === 'expired')
    return (
      <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
        Auth expired
      </span>
    );
  if (status === 'failed')
    return (
      <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
        Connection error
      </span>
    );
  return null;
}

function IntegrationCard({
  app,
  connection,
  busy,
  health,
  healthLoading,
  onConnect,
  onDisconnect,
}: {
  app: IntegrationApp;
  connection: ConnectionRow | null;
  busy: boolean;
  health: ConnectionHealth | null;
  healthLoading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const status = connection?.status ?? null;
  const action = pickRowAction({ comingSoon: app.comingSoon, status, busy });
  const errorLine = connection?.lastError && status !== 'active'
    ? explainCallbackReason(connection.lastError, app.toolkit)
    : null;

  return (
    <div
      className={cn(
        'group rounded-xl border border-border/70 bg-card p-4 flex flex-col gap-3 transition-colors duration-150',
        !app.comingSoon && 'hover:bg-muted/30',
      )}
    >
      {/* Top row: brand icon + status pill */}
      <div className="flex items-start justify-between gap-2">
        <AppIcon app={app} />
        <StatusPill status={status} comingSoon={app.comingSoon} />
      </div>

      {/* Name + blurb */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{app.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {connection?.label ? connection.label : app.blurb}
        </p>
        {errorLine && (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed line-clamp-3">
            {errorLine}
          </p>
        )}
      </div>

      {/* Bottom row: health badge + action */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {(health !== null || healthLoading) ? (
            <IntegrationHealthBadge health={health} loading={healthLoading} />
          ) : (
            <Dot status={status} comingSoon={app.comingSoon} />
          )}
        </div>
        <Action action={action} onConnect={onConnect} onDisconnect={onDisconnect} />
      </div>
    </div>
  );
}

function Dot({
  status,
  comingSoon,
}: {
  status: ConnectionRow['status'] | null;
  comingSoon?: boolean;
}) {
  // Coming-soon rows have no real status — keep the dot empty so the
  // "Coming soon" pill carries the meaning. Showing a colored dot on an
  // unconnectable row would imply state that isn't there.
  const color = comingSoon
    ? 'bg-border'
    : status === 'active'
      ? 'bg-emerald-500'
      : status === 'expired'
        ? 'bg-amber-500'
        : status === 'failed'
          ? 'bg-rose-500'
          : 'bg-border';
  return <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', color)} aria-hidden />;
}

/**
 * The action a row should render. Pure — pulled out so it's testable
 * without rendering. Three real states + a busy spinner + the
 * coming-soon pill for catalog placeholders that have no Composio
 * toolkit yet.
 */
export type RowAction =
  | { kind: 'busy' }
  | { kind: 'coming-soon' }
  | { kind: 'disconnect' }
  | { kind: 'reconnect' }
  | { kind: 'connect' };

export function pickRowAction(args: {
  comingSoon?: boolean;
  status: ConnectionRow['status'] | null;
  busy: boolean;
}): RowAction {
  // Coming-soon wins over everything (including busy) — these rows have
  // no connect path at all, so a spinner would be a lie.
  if (args.comingSoon) return { kind: 'coming-soon' };
  if (args.busy) return { kind: 'busy' };
  if (args.status === 'active') return { kind: 'disconnect' };
  if (args.status === 'expired' || args.status === 'failed') return { kind: 'reconnect' };
  return { kind: 'connect' };
}

function Action({
  action,
  onConnect,
  onDisconnect,
}: {
  action: RowAction;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (action.kind === 'busy') {
    return <Loader2 size={14} className="animate-spin text-muted-foreground" />;
  }
  if (action.kind === 'coming-soon') {
    // Disabled, no click target. The realtor can read the row, can see
    // the app exists, and isn't lured into tapping a button that 501s.
    return (
      <span
        aria-disabled="true"
        className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-muted text-muted-foreground"
      >
        Coming soon
      </span>
    );
  }
  if (action.kind === 'disconnect') {
    return (
      <button
        type="button"
        onClick={onDisconnect}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Disconnect
      </button>
    );
  }
  if (action.kind === 'reconnect') {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="text-xs text-foreground hover:opacity-80 transition-opacity font-medium"
      >
        Reconnect
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onConnect}
      className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
    >
      Connect
    </button>
  );
}

// Re-export catalog so the section's consumer doesn't need to import twice.
export { INTEGRATIONS };
