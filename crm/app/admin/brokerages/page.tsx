import { redirect } from 'next/navigation';
import { isPlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default async function AdminBrokeragesPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const { data: brokerages, error } = await supabase
    .from('Brokerage')
    .select('*, User!Brokerage_ownerId_fkey(id, name, email)')
    .order('createdAt', { ascending: false });

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-2 p-8">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load brokerages.</p>
          <a href="/admin/brokerages" className="text-xs text-primary hover:underline">Retry</a>
        </div>
      </div>
    );
  }

  const allIds = (brokerages ?? []).map((b) => b.id);
  const { data: memberships } = allIds.length > 0
    ? await supabase.from('BrokerageMembership').select('brokerageId').in('brokerageId', allIds)
    : { data: [] };

  const countMap: Record<string, number> = {};
  for (const m of memberships ?? []) {
    countMap[m.brokerageId] = (countMap[m.brokerageId] ?? 0) + 1;
  }

  const active    = (brokerages ?? []).filter((b) => b.status === 'active').length;
  const suspended = (brokerages ?? []).filter((b) => b.status === 'suspended').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Brokerages</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {brokerages?.length ?? 0} total · {active} active · {suspended} suspended
        </p>
      </div>

      {!brokerages || brokerages.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center">
            <Building2 size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No brokerages yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground">
                    Brokerage
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground hidden sm:table-cell">
                    Owner
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground hidden md:table-cell">
                    Members
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground hidden lg:table-cell">
                    Created
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {brokerages.map((b) => {
                  const owner = b.User as { id: string; name: string | null; email: string } | null;
                  const memberCount = countMap[b.id] ?? 0;
                  const isActive = b.status === 'active';
                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 size={14} className="text-primary" />
                          </div>
                          <p className="font-semibold truncate max-w-[200px]">{b.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {owner ? (
                          <Link
                            href={`/admin/users/${owner.id}`}
                            className="text-xs text-primary hover:underline underline-offset-2"
                          >
                            {owner.name ?? owner.email}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm">
                        {memberCount}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5',
                            isActive
                              ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                              : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
                          )}
                        >
                          {isActive ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                          {isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(b.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/brokerages/${b.id}`}
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          View
                          <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
