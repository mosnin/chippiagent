import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';

const statusStyle = (status: string) => {
  switch (status) {
    case 'pending':  return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
    case 'accepted': return 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15';
    default:         return 'text-muted-foreground bg-muted';
  }
};

export default async function AdminInvitationsPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');
  const { data: invitations, error } = await supabase
    .from('Invitation')
    .select('id, email, roleToAssign, status, expiresAt, createdAt, brokerageId, Brokerage(name)')
    .order('createdAt', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load invitations.</p>
      </div>
    );
  }

  const invs = (invitations ?? []) as unknown as Array<{
    id: string;
    email: string;
    roleToAssign: string;
    status: string;
    expiresAt: string;
    createdAt: string;
    brokerageId: string | null;
    Brokerage: { name: string } | null;
  }>;

  const roleLabel = (r: string) => r === 'broker_admin' ? 'Admin' : 'Realtor';

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Invitations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {invs.length} invitation{invs.length !== 1 ? 's' : ''} across all brokerages
        </p>
      </div>

      {invs.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">No invitations yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invs.map((inv) => {
            const sentAt = new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const expiresAt = new Date(inv.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <div key={inv.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.Brokerage?.name ?? '—'} · {roleLabel(inv.roleToAssign)} · Sent {sentAt}
                      {inv.status === 'pending' && ` · Expires ${expiresAt}`}
                    </p>
                  </div>
                  <span className={`inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 capitalize flex-shrink-0 ${statusStyle(inv.status)}`}>
                    {inv.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
