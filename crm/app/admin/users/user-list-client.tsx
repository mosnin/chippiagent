'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Users, X, ShieldBan, ShieldCheck, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { SUBSCRIPTION_STATUS_COLORS } from '@/lib/constants/colors';

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  onboard: boolean;
  createdAt: string;
  onboardingCurrentStep: number;
  platformRole: string;
  space: { slug: string; name: string; subscriptionStatus: string | null } | null;
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'onboarded', label: 'Onboarded' },
  { value: 'not-onboarded', label: 'Not onboarded' },
  { value: 'has-space', label: 'Has workspace' },
  { value: 'no-space', label: 'No workspace' },
  { value: 'suspended', label: 'Suspended' },
] as const;


function SuspendButton({
  userId,
  email,
  isSuspended,
  onToggle,
}: {
  userId: string;
  email: string;
  isSuspended: boolean;
  onToggle: (userId: string, newState: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isSuspended ? 'unsuspend_user' : 'suspend_user',
          userId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onToggle(userId, !isSuspended);
        setOpen(false);
      } else {
        setErr(data.error || 'Action failed.');
      }
    } catch {
      setErr('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors',
          isSuspended
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/30'
            : 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100 dark:text-red-400 dark:bg-red-500/15 dark:border-red-500/30',
        )}
      >
        {isSuspended ? <ShieldCheck size={11} /> : <ShieldBan size={11} />}
        {isSuspended ? 'Unsuspend' : 'Suspend'}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>
              {isSuspended ? 'Unsuspend account' : 'Suspend account'}
            </DialogTitle>
            <DialogDescription>
              {isSuspended ? (
                <>
                  Restore access for <strong>{email}</strong>? They will be able
                  to sign in immediately.
                </>
              ) : (
                <>
                  Prevent <strong>{email}</strong> from signing in? All active
                  sessions will be invalidated. You can unsuspend later.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {err && <p className="text-xs text-destructive px-1">{err}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant={isSuspended ? 'default' : 'destructive'}
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading
                ? 'Processing…'
                : isSuspended
                  ? 'Confirm unsuspend'
                  : 'Confirm suspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UserListClient({
  users: initialUsers,
  query,
  filter,
  resultCount,
}: {
  users: UserRow[];
  query: string;
  filter: string;
  resultCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(query);

  // Track suspension state locally for optimistic updates without full page reload
  const [suspendedIds, setSuspendedIds] = useState<Set<string>>(
    () =>
      new Set(
        initialUsers
          .filter((u) => u.platformRole === 'banned')
          .map((u) => u.id),
      ),
  );

  function navigate(newQuery?: string, newFilter?: string) {
    const params = new URLSearchParams();
    const q = newQuery ?? search;
    const f = newFilter ?? filter;
    if (q) params.set('q', q);
    if (f && f !== 'all') params.set('filter', f);
    startTransition(() => {
      router.push(`/admin/users?${params.toString()}`);
    });
  }

  function handleSuspendToggle(userId: string, newState: boolean) {
    setSuspendedIds((prev) => {
      const next = new Set(prev);
      if (newState) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate(search);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or workspace slug…"
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                navigate('', filter);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          Search
        </Button>
      </form>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => navigate(search, f.value)}
            className={cn(
              'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors',
              filter === f.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Count */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground font-semibold">{resultCount}</strong>{' '}
          {resultCount === 1 ? 'user' : 'users'}
        </span>
        {isPending && (
          <span className="text-xs animate-pulse">Loading…</span>
        )}
      </div>

      {/* Empty state */}
      {initialUsers.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Users size={20} className="text-muted-foreground" />
          </div>
          <p className="font-semibold mb-1">No users found</p>
          <p className="text-sm text-muted-foreground">
            {query ? 'Try a different search term.' : 'No users match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground hidden sm:table-cell">
                    Workspace
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground hidden md:table-cell">
                    Plan
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground hidden lg:table-cell">
                    Joined
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {initialUsers.map((user) => {
                  const isSuspended = suspendedIds.has(user.id);
                  const subStatus = user.space?.subscriptionStatus ?? null;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/admin/users/${user.id}`)}
                    >
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {(user.name || user.email || '?')
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate max-w-[180px]">
                              {user.name || 'No name'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={cn(
                              'inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5',
                              user.onboard
                                ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                                : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
                            )}
                          >
                            {user.onboard ? 'Onboarded' : `Step ${user.onboardingCurrentStep}`}
                          </span>
                          {isSuspended && (
                            <span className="inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15">
                              Suspended
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Workspace */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {user.space ? (
                          <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5 truncate max-w-[120px] inline-block">
                            {user.space.slug}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {subStatus ? (
                          <span
                            className={cn(
                              'text-[10px] font-semibold rounded-full px-2 py-0.5',
                              SUBSCRIPTION_STATUS_COLORS[subStatus] ?? SUBSCRIPTION_STATUS_COLORS.inactive,
                            )}
                          >
                            {subStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(user.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <SuspendButton
                            userId={user.id}
                            email={user.email}
                            isSuspended={isSuspended}
                            onToggle={handleSuspendToggle}
                          />
                          <Link
                            href={`/admin/users/${user.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            View
                            <ChevronRight size={12} />
                          </Link>
                        </div>
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
