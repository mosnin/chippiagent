import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContactFollowUpField } from '@/components/contacts/contact-follow-up-field';
import { getInitials, formatMoney, timeAgo } from '@/lib/formatting';
import type { Contact, ApplicationData, LeadScoreDetails } from '@/lib/types';
import {
  ArrowLeft,
  Phone,
  Mail,
  Home,
  MessageCircle,
  CircleAlert,
  Briefcase,
  DollarSign,
  Calendar,
  MapPin,
  Tag,
} from 'lucide-react';

function tierStyles(label: string | null) {
  if (label === 'hot') return 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400';
  if (label === 'warm') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300';
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  // Validate UUID format to avoid unnecessary DB round-trips
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) notFound();

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify the authenticated user owns this space
  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) notFound();

  const { data, error } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id)
    .single();
  if (error?.code === 'PGRST116') notFound();
  if (error) throw error;

  const lead = data as Contact;
  if (!lead.tags?.includes('application-link')) notFound();

  const app = lead.applicationData as ApplicationData | null;
  const details = lead.scoreDetails as LeadScoreDetails | null;

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground">
          <Link href={`/s/${slug}/leads`}>
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div className="text-sm text-muted-foreground">
          <Link href={`/s/${slug}/leads`} className="hover:text-foreground">Leads</Link>
          <span className="mx-1">/</span>
          <span className="text-foreground font-medium">{lead.name}</span>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
              {getInitials(lead.name)}
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-tight">{lead.name}</h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>{timeAgo(new Date(lead.createdAt))}</span>
                {lead.sourceLabel && (
                  <span className="inline-flex items-center gap-1"><Tag size={10} />{lead.sourceLabel}</span>
                )}
                <Badge variant="secondary" className="text-[10px]">{lead.leadType === 'buyer' ? 'Buyer' : lead.leadType === 'seller' ? 'Seller' : 'Rental'}</Badge>
              </div>
            </div>
          </div>
          <Link href={`/s/${slug}/contacts/${lead.id}`} className="text-xs font-medium rounded-md border border-border px-2.5 py-1.5 hover:bg-muted transition-colors">
            Open client view
          </Link>
        </div>

        <div className="px-5 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted/60">
              <Phone size={12} /> {lead.phone}
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted/60">
              <Mail size={12} /> {lead.email}
            </a>
          )}
          <ContactFollowUpField
            contactId={lead.id}
            followUpAt={lead.followUpAt ? String(lead.followUpAt) : null}
            lastContactedAt={lead.lastContactedAt ? String(lead.lastContactedAt) : null}
          />
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-semibold mb-1">
              <MessageCircle size={14} className="text-primary" /> AI score
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-3xl font-bold tabular-nums">{lead.leadScore != null ? Math.round(lead.leadScore) : '—'}</span>
              <span className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-1 ${tierStyles(lead.scoreLabel)}`}>
                {lead.scoreLabel ?? 'unscored'}
              </span>
            </div>
            {lead.scoreSummary && <p className="text-sm text-muted-foreground mt-2">{lead.scoreSummary}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoRow icon={DollarSign} label="Budget" value={typeof app?.monthlyRent === 'number' ? `${formatMoney(app.monthlyRent)}/mo` : lead.budget ? `${formatMoney(lead.budget)}/mo` : null} />
            <InfoRow icon={Briefcase} label="Employment" value={app?.employmentStatus ?? null} />
            <InfoRow icon={Calendar} label="Move-in" value={app?.targetMoveInDate ?? null} />
            <InfoRow icon={MapPin} label="Location" value={app?.propertyAddress ?? lead.preferences ?? null} />
            <InfoRow icon={Home} label="Property type" value={app?.propertyType ?? null} />
          </div>

          {details?.recommendedNextAction && (
            <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground flex items-start gap-2">
              <CircleAlert size={14} className="mt-0.5 text-amber-600" />
              {details.recommendedNextAction}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-1.5">
        <Icon size={12} />
        {label}
      </div>
      <p className="text-sm font-medium mt-1">{value ?? '—'}</p>
    </div>
  );
}
