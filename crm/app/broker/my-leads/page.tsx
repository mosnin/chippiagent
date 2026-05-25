import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { HOT_LEAD_THRESHOLD, WARM_LEAD_THRESHOLD } from '@/lib/constants';
import {
  PhoneIncoming,
  ArrowRight,
  Mail,
  Phone,
} from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'My Leads — Chippi' };

export default async function MyLeadsPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  const { brokerage, dbUserId } = ctx;

  // Find the member's personal Space
  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', dbUserId)
    .maybeSingle();

  if (!space) {
    return (
      <div className="space-y-6 max-w-[900px]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">My Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">Leads assigned to you by {brokerage.name}</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium text-foreground">No workspace found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Please complete your workspace setup to view assigned leads.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Query contacts with tag 'assigned-by-broker'
  const { data: contacts } = await supabase
    .from('Contact')
    .select('id, name, phone, email, leadScore, scoreLabel, tags, sourceLabel, createdAt, lastContactedAt')
    .eq('spaceId', space.id)
    .contains('tags', ['assigned-by-broker'])
    .order('createdAt', { ascending: false })
    .limit(100);

  const leads = (contacts ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    leadScore: number | null;
    scoreLabel: string | null;
    tags: string[];
    sourceLabel: string | null;
    createdAt: string;
    lastContactedAt: string | null;
  }>;

  function getScoreBadge(scoreLabel: string | null, leadScore: number | null) {
    if (!scoreLabel && leadScore == null) return null;
    const label = scoreLabel ?? `${leadScore}`;
    const color =
      scoreLabel === 'Hot' || (leadScore && leadScore >= HOT_LEAD_THRESHOLD)
        ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
        : scoreLabel === 'Warm' || (leadScore && leadScore >= WARM_LEAD_THRESHOLD)
          ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
          : 'text-muted-foreground bg-muted';
    return (
      <span className={`inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5 ${color}`}>
        {label}
      </span>
    );
  }

  return (
    <div className="space-y-6 max-w-[900px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">My Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads.length} lead{leads.length !== 1 ? 's' : ''} assigned to you by {brokerage.name}
          </p>
        </div>
      </div>

      {/* Leads list */}
      {leads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
              <PhoneIncoming size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No assigned leads yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto">
              When your brokerage assigns leads to you, they will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Lead
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Contact
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    Score
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                    Source
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Assigned
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {leads.map((lead) => {
                  const initials = (lead.name ?? '?')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <tr key={lead.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-3 sm:px-4 py-3">
                        <Link
                          href={`/s/${space.slug}/leads/${lead.id}`}
                          className="flex items-center gap-2.5 min-w-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                              {lead.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate sm:hidden">
                              {lead.phone ?? lead.email ?? ''}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                        <div className="space-y-0.5">
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone size={10} className="flex-shrink-0" />
                              <span className="truncate">{lead.phone}</span>
                            </div>
                          )}
                          {lead.email && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail size={10} className="flex-shrink-0" />
                              <span className="truncate">{lead.email}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-center hidden md:table-cell">
                        {getScoreBadge(lead.scoreLabel, lead.leadScore)}
                      </td>
                      <td className="px-3 sm:px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {`Assigned by ${brokerage.name}`}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(lead.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right hidden sm:table-cell">
                        {lead.lastContactedAt ? (
                          <span className="inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                            Contacted
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                            New
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
