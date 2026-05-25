'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  AlertTriangle,
  Zap,
  Users,
  Timer,
  CheckCircle2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export type RealtorResponseData = {
  userId: string;
  name: string;
  email: string;
  avgResponseMs: number | null;
  fastestResponseMs: number | null;
  contactedCount: number;
  waitingCount: number;
};

export type WaitingLead = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  ageMs: number;
  realtorName: string;
  realtorUserId: string;
};

type Props = {
  realtorData: RealtorResponseData[];
  waitingLeads: WaitingLead[];
  teamAvgMs: number | null;
  totalContacted: number;
  totalWaiting: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const ONE_HOUR = 3_600_000;
const FOUR_HOURS = 4 * ONE_HOUR;
const TWENTY_FOUR_HOURS = 24 * ONE_HOUR;

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < ONE_HOUR) return `${Math.round(ms / 60_000)}m`;
  if (ms < TWENTY_FOUR_HOURS) {
    const hrs = Math.floor(ms / ONE_HOUR);
    const mins = Math.round((ms % ONE_HOUR) / 60_000);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  const days = Math.floor(ms / TWENTY_FOUR_HOURS);
  const hrs = Math.round((ms % TWENTY_FOUR_HOURS) / ONE_HOUR);
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < ONE_HOUR) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < TWENTY_FOUR_HOURS) return `${Math.floor(diff / ONE_HOUR)}h ago`;
  const days = Math.floor(diff / TWENTY_FOUR_HOURS);
  return `${days}d ago`;
}

function urgencyLevel(ageMs: number): 'red' | 'amber' | 'normal' {
  if (ageMs > TWENTY_FOUR_HOURS) return 'red';
  if (ageMs > FOUR_HOURS) return 'amber';
  return 'normal';
}

function getBarWidth(value: number | null, maxValue: number): number {
  if (value === null || maxValue === 0) return 0;
  return Math.min(100, Math.max(4, (value / maxValue) * 100));
}

// ── Component ────────────────────────────────────────────────────────────────

export function ResponseTimesClient({
  realtorData,
  waitingLeads,
  teamAvgMs,
  totalContacted,
  totalWaiting,
}: Props) {
  const maxAvg = Math.max(
    ...realtorData.map((r) => r.avgResponseMs ?? 0),
    1,
  );

  return (
    <div className="space-y-6">
      {/* ── Summary cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Team Avg Response</p>
                <p className="text-2xl font-bold mt-0.5 tabular-nums">
                  {teamAvgMs !== null ? formatDuration(teamAvgMs) : '--'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Clock size={15} className="text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Leads Contacted</p>
                <p className="text-2xl font-bold mt-0.5 tabular-nums">{totalContacted}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={15} className="text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Waiting for Contact</p>
                <p className="text-2xl font-bold mt-0.5 tabular-nums">{totalWaiting}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Timer size={15} className="text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Realtors</p>
                <p className="text-2xl font-bold mt-0.5 tabular-nums">{realtorData.length}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Users size={15} className="text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Alert section: Leads waiting for contact ──────────── */}
      {waitingLeads.length > 0 && (
        <Card>
          <CardContent className="px-5 py-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={16} className="text-amber-500" />
              <h2 className="text-sm font-semibold">Leads Waiting for Contact</h2>
              <Badge variant="secondary" className="ml-auto text-xs">
                {waitingLeads.length} waiting
              </Badge>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {waitingLeads.map((lead) => {
                const urgency = urgencyLevel(lead.ageMs);
                return (
                  <div
                    key={lead.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                      urgency === 'red'
                        ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30'
                        : urgency === 'amber'
                          ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30'
                          : 'border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lead.name}</p>
                      {lead.email && (
                        <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-semibold ${
                        urgency === 'red'
                          ? 'text-red-600 dark:text-red-400'
                          : urgency === 'amber'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                      }`}>
                        Waiting {formatDuration(lead.ageMs)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Assigned to {lead.realtorName}
                      </p>
                    </div>
                    {urgency === 'red' && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                        Overdue
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Per-realtor stats with bar chart ──────────────────── */}
      <Card>
        <CardContent className="px-5 py-4">
          <h2 className="text-sm font-semibold mb-4">Response Time by Realtor</h2>

          {realtorData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No realtors found.
            </p>
          ) : (
            <div className="space-y-3">
              {realtorData.map((realtor) => (
                <div key={realtor.userId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                        {realtor.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{realtor.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {realtor.contactedCount} contacted
                          {realtor.waitingCount > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              {' '}&middot; {realtor.waitingCount} waiting
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {realtor.avgResponseMs !== null
                          ? formatDuration(realtor.avgResponseMs)
                          : '--'}
                      </p>
                      {realtor.fastestResponseMs !== null && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 justify-end">
                          <Zap size={10} className="text-primary" />
                          {formatDuration(realtor.fastestResponseMs)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bar */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        realtor.avgResponseMs !== null && realtor.avgResponseMs > TWENTY_FOUR_HOURS
                          ? 'bg-red-500'
                          : realtor.avgResponseMs !== null && realtor.avgResponseMs > FOUR_HOURS
                            ? 'bg-amber-500'
                            : 'bg-primary'
                      }`}
                      style={{
                        width: `${getBarWidth(realtor.avgResponseMs, maxAvg)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              Under 4h
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              4-24h
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              Over 24h
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
