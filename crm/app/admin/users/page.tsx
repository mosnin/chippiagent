import { supabase } from '@/lib/supabase';
import { UserListClient } from './user-list-client';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Users — Admin — Chippi' };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const params = await searchParams;
  const query = params.q?.trim() || '';
  const filter = params.filter || 'all';

  let supaQuery = supabase
    .from('User')
    .select(
      'id, name, email, onboard, createdAt, onboardingCurrentStep, platformRole, Space(slug, name, stripeSubscriptionStatus)',
    );

  if (filter === 'onboarded') supaQuery = supaQuery.eq('onboard', true);
  else if (filter === 'not-onboarded') supaQuery = supaQuery.eq('onboard', false);
  else if (filter === 'suspended') supaQuery = supaQuery.eq('platformRole', 'banned');

  const { data, error } = await supaQuery.order('createdAt', { ascending: false }).limit(200);
  if (error) throw error;

  let results = (data ?? []) as any[];

  if (query) {
    const s = query.toLowerCase();
    results = results.filter((r: any) => {
      const sp = Array.isArray(r.Space) ? r.Space[0] : r.Space;
      return (
        r.name?.toLowerCase().includes(s) ||
        r.email?.toLowerCase().includes(s) ||
        sp?.slug?.toLowerCase().includes(s)
      );
    });
  }

  if (filter === 'has-space')
    results = results.filter((r: any) => {
      const sp = Array.isArray(r.Space) ? r.Space[0] : r.Space;
      return sp !== null && sp !== undefined;
    });
  if (filter === 'no-space')
    results = results.filter((r: any) => {
      const sp = Array.isArray(r.Space) ? r.Space[0] : r.Space;
      return !sp;
    });

  const users = results.map((row: any) => {
    const spaceData = Array.isArray(row.Space) ? row.Space[0] : row.Space;
    return {
      id: row.id as string,
      name: row.name as string | null,
      email: row.email as string,
      onboard: row.onboard as boolean,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : String(row.createdAt),
      onboardingCurrentStep: row.onboardingCurrentStep as number,
      platformRole: (row.platformRole ?? 'user') as string,
      space: spaceData?.slug
        ? {
            slug: spaceData.slug as string,
            name: spaceData.name as string,
            subscriptionStatus: (spaceData.stripeSubscriptionStatus as string | null) ?? null,
          }
        : null,
    };
  });

  const { count, error: countError } = await supabase
    .from('User')
    .select('*', { count: 'exact', head: true });
  if (countError) throw countError;
  const totalCount = count ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{totalCount} total accounts</p>
      </div>
      <UserListClient users={users} query={query} filter={filter} resultCount={users.length} />
    </div>
  );
}
