import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { Building2, ShieldCheck, UserCircle } from 'lucide-react';
import {
  H1,
  H2,
  TITLE_FONT,
  BODY,
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
  SECTION_RHYTHM,
  READING_MAX,
} from '@/lib/typography';

export default async function BrokerageInvitesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let userEmail: string | null = null;
  try {
    const { data: user, error } = await supabase
      .from('User')
      .select('email')
      .eq('clerkId', userId)
      .maybeSingle();
    if (error) throw error;
    userEmail = user?.email?.toLowerCase() ?? null;
  } catch (err) {
    console.error('[settings/brokerage] Failed to fetch user', err);
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center space-y-3 p-8">
          <h2 className={H2}>Something went wrong</h2>
          <p className={BODY_MUTED}>
            I couldn&apos;t load your invites. Usually temporary.
          </p>
          <a href={`/s/${slug}/settings/brokerage`} className={PRIMARY_PILL}>
            Try again
          </a>
        </div>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className={`${SECTION_RHYTHM} ${READING_MAX}`}>
        <h1 className={H1} style={TITLE_FONT}>
          Brokerage
        </h1>
        <p className={BODY_MUTED}>No email found for your account.</p>
      </div>
    );
  }

  let invitations: Array<{
    id: string;
    email: string;
    roleToAssign: string;
    token: string;
    status: string;
    expiresAt: string;
    createdAt: string;
    Brokerage: { id: string; name: string } | null;
  }> = [];

  try {
    const { data, error } = await supabase
      .from('Invitation')
      .select('id, email, roleToAssign, token, status, expiresAt, createdAt, Brokerage(id, name)')
      .ilike('email', userEmail)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });
    if (error) throw error;
    invitations = (data ?? []) as unknown as typeof invitations;
  } catch (err) {
    console.error('[settings/brokerage] Failed to fetch invitations', err);
  }

  const roleLabel = (role: string) => (role === 'broker_admin' ? 'Admin' : 'Member');

  // Inline narration ladder.
  const narration =
    invitations.length === 0
      ? 'No pending invitations right now.'
      : invitations.length === 1
        ? '1 brokerage invite waiting.'
        : `${invitations.length} brokerage invites waiting.`;

  return (
    <div className={`${SECTION_RHYTHM} ${READING_MAX}`}>
      <div className="space-y-2">
        <h1 className={H1} style={TITLE_FONT}>
          Brokerage
        </h1>
        <p className={BODY_MUTED}>{narration}</p>
      </div>

      {invitations.length === 0 ? (
        <div className="rounded-md border border-border/70 bg-background px-5 py-12 text-center space-y-1">
          <p className={`${BODY} font-medium`}>Nothing here yet</p>
          <p className={CAPTION}>
            When a brokerage invites you, it shows up here.
          </p>
        </div>
      ) : (
        <div>
          {invitations.map((inv) => {
            const brokerageName = Array.isArray(inv.Brokerage)
              ? (inv.Brokerage as Array<{ name?: string }>)[0]?.name
              : inv.Brokerage?.name;
            const expiresAt = new Date(inv.expiresAt);
            const isExpired = expiresAt < new Date();
            const sentAt = new Date(inv.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-4 py-4 border-b border-border/60 last:border-b-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-foreground/[0.06] flex items-center justify-center flex-shrink-0">
                    <Building2 size={16} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className={`${BODY} font-medium truncate`}>{brokerageName ?? 'Unknown brokerage'}</p>
                    <div className={`flex items-center gap-2 ${CAPTION} mt-0.5`}>
                      <span className="inline-flex items-center gap-1">
                        {inv.roleToAssign === 'broker_admin' ? (
                          <ShieldCheck size={11} />
                        ) : (
                          <UserCircle size={11} />
                        )}
                        Invited as {roleLabel(inv.roleToAssign)}
                      </span>
                      <span>&#183;</span>
                      <span>Sent {sentAt}</span>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {isExpired ? (
                    <span className={CAPTION}>Expired</span>
                  ) : (
                    <a href={`/invite/${inv.token}`} className={PRIMARY_PILL}>
                      Accept
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
