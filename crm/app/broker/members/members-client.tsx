'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Search, X, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RemoveMemberButton } from '@/components/broker/remove-member-button';
import { ChangeRoleButton } from '@/components/broker/change-role-button';
import { OffboardMemberDialog } from '@/components/broker/offboard-member-dialog';

interface Member {
  id: string;
  role: string;
  createdAt: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userOnboard: boolean;
  spaceSlug: string | null;
}

const roleLabel = (role: string) =>
  role === 'broker_owner' ? 'Owner' : role === 'broker_admin' ? 'Admin' : 'Realtor';

const roleBadgeClass = (role: string) => {
  switch (role) {
    case 'broker_owner':
      return 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15';
    case 'broker_admin':
      return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
    default:
      return 'text-muted-foreground bg-muted';
  }
};

type RoleTab = 'all' | 'admins' | 'members';

export function MembersClient({
  members,
  brokerageName,
  currentUserRole,
}: {
  members: Member[];
  brokerageName: string;
  currentUserRole: string;
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<RoleTab>('all');
  const [offboardTargetId, setOffboardTargetId] = useState<string | null>(null);

  const adminCount = members.filter((m) => m.role === 'broker_admin' || m.role === 'broker_owner').length;
  const memberCount = members.filter((m) => m.role === 'realtor_member').length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return members.filter((m) => {
      if (tab === 'admins' && m.role !== 'broker_admin' && m.role !== 'broker_owner') return false;
      if (tab === 'members' && m.role !== 'realtor_member') return false;
      if (q) {
        return (
          (m.userName ?? '').toLowerCase().includes(q) ||
          (m.userEmail ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [members, search, tab]);

  const tabs: { key: RoleTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: members.length },
    { key: 'admins', label: 'Admins', count: adminCount },
    { key: 'members', label: 'Members', count: memberCount },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {members.length} {members.length === 1 ? 'member' : 'members'} in {brokerageName}
            <span className="mx-1.5">&middot;</span>
            <span className="text-amber-600 dark:text-amber-400">{adminCount} {adminCount === 1 ? 'admin' : 'admins'}</span>
            <span className="mx-1.5">&middot;</span>
            <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-0 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors rounded-t-md ${
              tab === t.key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${
              tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {t.count}
            </span>
            {tab === t.key && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members..."
          className="h-8 w-56 rounded-lg border border-border bg-muted/60 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">No members yet.</p>
            <div className="flex items-center justify-center gap-3">
              <a href="/broker/invitations" className="text-xs text-primary font-medium hover:underline underline-offset-2">
                Send an email invite &rarr;
              </a>
              <span className="text-xs text-muted-foreground">or</span>
              <a href="/broker/invitations" className="text-xs text-primary font-medium hover:underline underline-offset-2">
                Share an invite code &rarr;
              </a>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const initials = ((m.userName ?? m.userEmail ?? '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2));
            const joinedAt = new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const canManage =
              m.role !== 'broker_owner' &&
              (currentUserRole === 'broker_owner' ||
                (currentUserRole === 'broker_admin' && m.role === 'realtor_member'));
            return (
              <div key={m.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{m.userName ?? 'No name'}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.userEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-right">
                    <div className="hidden sm:block text-right">
                      <p className="text-xs text-muted-foreground">Joined {joinedAt}</p>
                      {m.spaceSlug && (
                        <p className="text-xs text-primary font-medium">/{m.spaceSlug}</p>
                      )}
                    </div>
                    <span className={`hidden sm:inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 ${roleBadgeClass(m.role)}`}>
                      {roleLabel(m.role)}
                    </span>
                    {m.userOnboard ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                        <CheckCircle2 size={11} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                        <AlertCircle size={11} /> Pending
                      </span>
                    )}
                    {canManage && (
                      <>
                        <ChangeRoleButton
                          membershipId={m.id}
                          currentRole={m.role}
                          memberName={m.userName ?? m.userEmail ?? 'this member'}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
                          onClick={() => setOffboardTargetId(m.id)}
                          title={`Offboard ${m.userName ?? m.userEmail ?? 'this member'}`}
                        >
                          <UserMinus size={13} />
                        </Button>
                        <RemoveMemberButton
                          membershipId={m.id}
                          memberName={m.userName ?? m.userEmail ?? 'this member'}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No members match your search.</p>
          )}
        </div>
      )}

      {(() => {
        const target = members.find((m) => m.id === offboardTargetId) ?? null;
        if (!target) return null;
        const otherMembers = members
          .filter((m) => m.id !== target.id)
          .map((m) => ({
            id: m.id,
            name: m.userName,
            email: m.userEmail ?? '',
            userStatus: m.userOnboard ? 'active' : 'pending',
          }));
        return (
          <OffboardMemberDialog
            member={{
              id: target.id,
              userId: target.userId,
              name: target.userName,
              email: target.userEmail ?? '',
              role: target.role,
            }}
            otherMembers={otherMembers}
            open={offboardTargetId === target.id}
            onOpenChange={(o) => {
              if (!o) setOffboardTargetId(null);
            }}
            onDone={() => {
              setOffboardTargetId(null);
              // Fall back to a hard refresh — matches how RemoveMemberButton /
              // ChangeRoleButton refresh the list after server mutations.
              window.location.reload();
            }}
          />
        );
      })()}
    </div>
  );
}
