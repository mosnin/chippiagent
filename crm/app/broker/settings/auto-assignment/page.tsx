'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type AssignmentMethod = 'manual' | 'round_robin' | 'score_based';

type SettingsResponse = {
  id: string;
  name: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  status: 'active' | 'suspended';
  privacyPolicyHtml: string | null;
  autoAssignEnabled: boolean;
  assignmentMethod: AssignmentMethod;
  lastAssignedUserId: string | null;
  lastAssignedUserName: string | null;
  realtorMemberCount: number;
};

const METHOD_LABEL: Record<AssignmentMethod, string> = {
  manual: 'Manual only',
  round_robin: 'Round-robin',
  score_based: 'Score-based',
};

export default function BrokerSettingsAutoAssignmentPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [method, setMethod] = useState<AssignmentMethod>('round_robin');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/broker/settings', { cache: 'no-store' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as SettingsResponse;
      setSettings(data);
      setEnabled(Boolean(data.autoAssignEnabled));
      // If the stored method is somehow invalid, fall back to round_robin so the
      // UI shows a sensible default rather than an empty radio group.
      const nextMethod: AssignmentMethod =
        data.assignmentMethod === 'manual' ||
        data.assignmentMethod === 'round_robin' ||
        data.assignmentMethod === 'score_based'
          ? data.assignmentMethod
          : 'round_robin';
      setMethod(nextMethod);
    } catch {
      setLoadError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/broker/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoAssignEnabled: enabled,
          assignmentMethod: method,
        }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as SettingsResponse | null;
        if (data && typeof data.autoAssignEnabled === 'boolean') {
          setSettings(data);
        }
        setSaved(true);
        toast.success('Auto-assignment settings saved');
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Failed to save');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Auto-Assignment</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure how new leads are automatically distributed to your realtors
        </p>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : loadError ? (
        <LoadErrorState
          message={loadError}
          onRetry={() => {
            setLoading(true);
            void loadSettings();
          }}
        />
      ) : (
        <>
          <Card>
            <CardContent className="px-5 py-5 space-y-5">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Enable auto-assignment</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically assign new leads to available realtors
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => setEnabled(!enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Assignment method */}
              {enabled && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <Label className="text-sm font-medium">Assignment method</Label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="method"
                        value="round_robin"
                        checked={method === 'round_robin'}
                        onChange={() => setMethod('round_robin')}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">Round-robin</p>
                        <p className="text-xs text-muted-foreground">
                          Distribute leads evenly across all active realtors in rotation
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="method"
                        value="score_based"
                        checked={method === 'score_based'}
                        onChange={() => setMethod('score_based')}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">Score-based</p>
                        <p className="text-xs text-muted-foreground">
                          Assign leads to the realtor with the highest performance score and availability
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="method"
                        value="manual"
                        checked={method === 'manual'}
                        onChange={() => setMethod('manual')}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">Manual only</p>
                        <p className="text-xs text-muted-foreground">
                          All leads stay unassigned until a broker admin manually assigns them
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <><Loader2 size={14} className="mr-1.5 animate-spin" /> Saving...</>
                ) : saved ? (
                  <><CheckCircle2 size={14} className="mr-1.5" /> Saved</>
                ) : (
                  'Save changes'
                )}
              </Button>
            </CardContent>
          </Card>

          {settings?.autoAssignEnabled && (
            <RoutingActivityCard settings={settings} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readout card
// ---------------------------------------------------------------------------

function RoutingActivityCard({ settings }: { settings: SettingsResponse }) {
  return (
    <Card>
      <CardContent className="px-5 py-5 space-y-3">
        <div>
          <Label className="text-sm font-medium">Routing activity</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live snapshot of how leads are being routed right now.
          </p>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current method</span>
            <span className="font-medium">{METHOD_LABEL[settings.assignmentMethod]}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last assigned agent</span>
            <span className="font-medium">
              {settings.lastAssignedUserName ?? 'Nobody yet'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active realtors</span>
            <span className="font-medium">{settings.realtorMemberCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading + error
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <Card aria-busy>
      <CardContent className="px-5 py-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
        <div className="space-y-3 pt-2 border-t border-border">
          <Skeleton className="h-4 w-32" />
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                <Skeleton className="size-4 rounded-full mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-8 w-28" />
      </CardContent>
    </Card>
  );
}

function LoadErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="px-5 py-12 text-center space-y-3">
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load auto-assignment settings</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
