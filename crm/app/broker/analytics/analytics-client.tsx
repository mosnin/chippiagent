'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, TrendingUp, Users, BarChart3 } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentFunnelData {
  userId: string;
  name: string;
  email: string;
  role: string;
  totalLeads: number;
  qualification: number;
  tours: number;
  applications: number;
  activeDeals: number;
  wonDeals: number;
  lostDeals: number;
  totalDeals: number;
  wonValue: number;
  leadToTour: number;
  tourToApp: number;
  appToDeal: number;
  overallConversion: number;
  // Buyer funnel counts
  buyerLeads?: number;
  buyerPreApproved?: number;
  buyerShowings?: number;
  buyerOffers?: number;
  buyerUnderContract?: number;
  buyerClosed?: number;
}

interface Props {
  agents: AgentFunnelData[];
}

// ── Conversion threshold constants ───────────────────────────────────────────

const CONVERSION_THRESHOLD_GOOD = 20; // % above this = green
const CONVERSION_THRESHOLD_OK = 10;   // % above this = amber, below = muted

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function initials(name: string) {
  return name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Funnel bar component ─────────────────────────────────────────────────────

function FunnelBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 text-right flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 h-7 bg-muted/40 rounded-md overflow-hidden relative">
        <div
          className={`h-full rounded-md transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-y-0 left-2 flex items-center text-xs font-semibold text-foreground tabular-nums">
          {value}
        </span>
      </div>
    </div>
  );
}

// ── Agent funnel card ────────────────────────────────────────────────────────

function AgentFunnelCard({ agent }: { agent: AgentFunnelData }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
            {initials(agent.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{agent.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-bold tabular-nums text-primary">{agent.overallConversion}%</p>
            <p className="text-[10px] text-muted-foreground">Lead-to-Win</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <FunnelBar label="Leads" value={agent.totalLeads} maxValue={agent.totalLeads} color="bg-violet-500/60" />
          <FunnelBar label="Tours" value={agent.tours} maxValue={agent.totalLeads} color="bg-purple-500/60" />
          <FunnelBar label="Applications" value={agent.applications} maxValue={agent.totalLeads} color="bg-amber-500/60" />
          <FunnelBar label="Deals" value={agent.totalDeals} maxValue={agent.totalLeads} color="bg-cyan-500/60" />
          <FunnelBar label="Won" value={agent.wonDeals} maxValue={agent.totalLeads} color="bg-emerald-500/60" />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
          <div className="text-center">
            <p className="text-xs font-semibold tabular-nums">{agent.leadToTour}%</p>
            <p className="text-[10px] text-muted-foreground">Lead-to-Tour</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold tabular-nums">{agent.tourToApp}%</p>
            <p className="text-[10px] text-muted-foreground">Tour-to-App</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold tabular-nums">{agent.appToDeal}%</p>
            <p className="text-[10px] text-muted-foreground">App-to-Deal</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

function BuyerFunnelCard({ agent }: { agent: AgentFunnelData }) {
  const maxVal = agent.buyerLeads ?? 0;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
            {initials(agent.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{agent.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-bold tabular-nums text-primary">{maxVal > 0 ? Math.round(((agent.buyerClosed ?? 0) / maxVal) * 100) : 0}%</p>
            <p className="text-[10px] text-muted-foreground">Lead-to-Close</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <FunnelBar label="Leads" value={agent.buyerLeads ?? 0} maxValue={maxVal} color="bg-violet-500/60" />
          <FunnelBar label="Pre-Approved" value={agent.buyerPreApproved ?? 0} maxValue={maxVal} color="bg-blue-500/60" />
          <FunnelBar label="Showings" value={agent.buyerShowings ?? 0} maxValue={maxVal} color="bg-purple-500/60" />
          <FunnelBar label="Offers" value={agent.buyerOffers ?? 0} maxValue={maxVal} color="bg-amber-500/60" />
          <FunnelBar label="Under Contract" value={agent.buyerUnderContract ?? 0} maxValue={maxVal} color="bg-cyan-500/60" />
          <FunnelBar label="Closed" value={agent.buyerClosed ?? 0} maxValue={maxVal} color="bg-emerald-500/60" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsClient({ agents }: Props) {
  const [view, setView] = useState<'funnel' | 'table'>('funnel');
  const [sortBy, setSortBy] = useState<'name' | 'leads' | 'conversion'>('leads');
  const [leadType, setLeadType] = useState<'rental' | 'buyer'>('rental');

  const sorted = useMemo(() => {
    const copy = [...agents];
    if (sortBy === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'leads') copy.sort((a, b) => b.totalLeads - a.totalLeads);
    else if (sortBy === 'conversion') copy.sort((a, b) => b.overallConversion - a.overallConversion);
    return copy;
  }, [agents, sortBy]);

  // Team totals
  const teamTotals = useMemo(() => {
    const t = agents.reduce(
      (acc, a) => ({
        totalLeads: acc.totalLeads + a.totalLeads,
        tours: acc.tours + a.tours,
        applications: acc.applications + a.applications,
        totalDeals: acc.totalDeals + a.totalDeals,
        wonDeals: acc.wonDeals + a.wonDeals,
        wonValue: acc.wonValue + a.wonValue,
      }),
      { totalLeads: 0, tours: 0, applications: 0, totalDeals: 0, wonDeals: 0, wonValue: 0 }
    );
    return {
      ...t,
      leadToTour: t.totalLeads > 0 ? Math.round((t.tours / t.totalLeads) * 100) : 0,
      tourToApp: t.tours > 0 ? Math.round((t.applications / t.tours) * 100) : 0,
      appToDeal: t.applications > 0 ? Math.round((t.totalDeals / t.applications) * 100) : 0,
      overallConversion: t.totalLeads > 0 ? Math.round((t.wonDeals / t.totalLeads) * 100) : 0,
    };
  }, [agents]);

  const buyerTeamTotals = useMemo(() => {
    const t = agents.reduce(
      (acc, a) => ({
        buyerLeads: acc.buyerLeads + (a.buyerLeads ?? 0),
        buyerPreApproved: acc.buyerPreApproved + (a.buyerPreApproved ?? 0),
        buyerShowings: acc.buyerShowings + (a.buyerShowings ?? 0),
        buyerOffers: acc.buyerOffers + (a.buyerOffers ?? 0),
        buyerUnderContract: acc.buyerUnderContract + (a.buyerUnderContract ?? 0),
        buyerClosed: acc.buyerClosed + (a.buyerClosed ?? 0),
      }),
      { buyerLeads: 0, buyerPreApproved: 0, buyerShowings: 0, buyerOffers: 0, buyerUnderContract: 0, buyerClosed: 0 }
    );
    return t;
  }, [agents]);

  return (
    <div className="space-y-6">
      {/* Lead type toggle */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setLeadType('rental')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            leadType === 'rental' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Rental
        </button>
        <button
          onClick={() => setLeadType('buyer')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            leadType === 'buyer' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Buyer
        </button>
      </div>

      {/* Team overview funnel */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Team {leadType === 'buyer' ? 'Buyer' : 'Rental'} Conversion Funnel</h2>
            </div>
            {leadType === 'rental' ? (
              <p className="text-lg font-bold tabular-nums text-primary">{teamTotals.overallConversion}% overall</p>
            ) : (
              <p className="text-lg font-bold tabular-nums text-primary">
                {buyerTeamTotals.buyerLeads > 0 ? Math.round((buyerTeamTotals.buyerClosed / buyerTeamTotals.buyerLeads) * 100) : 0}% overall
              </p>
            )}
          </div>

          {leadType === 'rental' ? (
          <div className="space-y-2">
            <FunnelBar label="Total Leads" value={teamTotals.totalLeads} maxValue={teamTotals.totalLeads} color="bg-violet-500/60" />
            <div className="flex items-center gap-1 pl-28">
              <ArrowRight size={10} className="text-muted-foreground/40" />
              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{teamTotals.leadToTour}%</span>
            </div>
            <FunnelBar label="Tours" value={teamTotals.tours} maxValue={teamTotals.totalLeads} color="bg-purple-500/60" />
            <div className="flex items-center gap-1 pl-28">
              <ArrowRight size={10} className="text-muted-foreground/40" />
              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{teamTotals.tourToApp}%</span>
            </div>
            <FunnelBar label="Applications" value={teamTotals.applications} maxValue={teamTotals.totalLeads} color="bg-amber-500/60" />
            <div className="flex items-center gap-1 pl-28">
              <ArrowRight size={10} className="text-muted-foreground/40" />
              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{teamTotals.appToDeal}%</span>
            </div>
            <FunnelBar label="Deals" value={teamTotals.totalDeals} maxValue={teamTotals.totalLeads} color="bg-cyan-500/60" />
            <FunnelBar label="Won" value={teamTotals.wonDeals} maxValue={teamTotals.totalLeads} color="bg-emerald-500/60" />
          </div>
          ) : (
          <div className="space-y-2">
            <FunnelBar label="Leads" value={buyerTeamTotals.buyerLeads} maxValue={buyerTeamTotals.buyerLeads} color="bg-violet-500/60" />
            <div className="flex items-center gap-1 pl-28">
              <ArrowRight size={10} className="text-muted-foreground/40" />
              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                {buyerTeamTotals.buyerLeads > 0 ? Math.round((buyerTeamTotals.buyerPreApproved / buyerTeamTotals.buyerLeads) * 100) : 0}%
              </span>
            </div>
            <FunnelBar label="Pre-Approved" value={buyerTeamTotals.buyerPreApproved} maxValue={buyerTeamTotals.buyerLeads} color="bg-blue-500/60" />
            <div className="flex items-center gap-1 pl-28">
              <ArrowRight size={10} className="text-muted-foreground/40" />
              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                {buyerTeamTotals.buyerPreApproved > 0 ? Math.round((buyerTeamTotals.buyerShowings / buyerTeamTotals.buyerPreApproved) * 100) : 0}%
              </span>
            </div>
            <FunnelBar label="Showings" value={buyerTeamTotals.buyerShowings} maxValue={buyerTeamTotals.buyerLeads} color="bg-purple-500/60" />
            <div className="flex items-center gap-1 pl-28">
              <ArrowRight size={10} className="text-muted-foreground/40" />
              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                {buyerTeamTotals.buyerShowings > 0 ? Math.round((buyerTeamTotals.buyerOffers / buyerTeamTotals.buyerShowings) * 100) : 0}%
              </span>
            </div>
            <FunnelBar label="Offers" value={buyerTeamTotals.buyerOffers} maxValue={buyerTeamTotals.buyerLeads} color="bg-amber-500/60" />
            <div className="flex items-center gap-1 pl-28">
              <ArrowRight size={10} className="text-muted-foreground/40" />
              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                {buyerTeamTotals.buyerOffers > 0 ? Math.round((buyerTeamTotals.buyerUnderContract / buyerTeamTotals.buyerOffers) * 100) : 0}%
              </span>
            </div>
            <FunnelBar label="Under Contract" value={buyerTeamTotals.buyerUnderContract} maxValue={buyerTeamTotals.buyerLeads} color="bg-cyan-500/60" />
            <div className="flex items-center gap-1 pl-28">
              <ArrowRight size={10} className="text-muted-foreground/40" />
              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                {buyerTeamTotals.buyerUnderContract > 0 ? Math.round((buyerTeamTotals.buyerClosed / buyerTeamTotals.buyerUnderContract) * 100) : 0}%
              </span>
            </div>
            <FunnelBar label="Closed" value={buyerTeamTotals.buyerClosed} maxValue={buyerTeamTotals.buyerLeads} color="bg-emerald-500/60" />
          </div>
          )}
        </CardContent>
      </Card>

      {/* View toggle + sort */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setView('funnel')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === 'funnel' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 size={12} className="inline mr-1.5 -mt-0.5" />
            Funnels
          </button>
          <button
            onClick={() => setView('table')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === 'table' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users size={12} className="inline mr-1.5 -mt-0.5" />
            Table
          </button>
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
        >
          <option value="leads">Sort by Leads</option>
          <option value="conversion">Sort by Conversion</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      {/* Funnel view */}
      {view === 'funnel' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((agent) =>
            leadType === 'buyer' ? (
              <BuyerFunnelCard key={agent.userId} agent={agent} />
            ) : (
              <AgentFunnelCard key={agent.userId} agent={agent} />
            )
          )}
          {sorted.length === 0 && (
            <Card className="md:col-span-2">
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No agents with data yet.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Table view */}
      {view === 'table' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agent</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Leads</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tours</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Apps</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deals</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Won</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Won Value</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lead-to-Tour</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Tour-to-App</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">App-to-Deal</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conversion %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {sorted.map((a) => (
                  <tr key={a.userId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary flex-shrink-0">
                          {initials(a.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{a.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{a.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-semibold">{a.totalLeads}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{a.tours}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs hidden md:table-cell">{a.applications}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-semibold">{a.totalDeals}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs hidden sm:table-cell text-emerald-600 dark:text-emerald-400 font-semibold">{a.wonDeals}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs hidden lg:table-cell text-emerald-600 dark:text-emerald-400">{formatCompact(a.wonValue)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{a.leadToTour}%</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs hidden md:table-cell">{a.tourToApp}%</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs hidden md:table-cell">{a.appToDeal}%</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                        a.overallConversion >= CONVERSION_THRESHOLD_GOOD
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : a.overallConversion >= CONVERSION_THRESHOLD_OK
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {a.overallConversion}%
                      </span>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No agent data available.
                    </td>
                  </tr>
                )}
                {/* Totals row */}
                {sorted.length > 0 && (
                  <tr className="bg-muted/40 font-semibold">
                    <td className="px-4 py-3 text-xs font-bold">Team Total</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-bold">{teamTotals.totalLeads}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-bold">{teamTotals.tours}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-bold hidden md:table-cell">{teamTotals.applications}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-bold">{teamTotals.totalDeals}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-bold hidden sm:table-cell text-emerald-600 dark:text-emerald-400">{teamTotals.wonDeals}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-bold hidden lg:table-cell text-emerald-600 dark:text-emerald-400">{formatCompact(teamTotals.wonValue)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-bold">{teamTotals.leadToTour}%</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-bold hidden md:table-cell">{teamTotals.tourToApp}%</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-bold hidden md:table-cell">{teamTotals.appToDeal}%</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums bg-primary/10 text-primary">
                        {teamTotals.overallConversion}%
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
