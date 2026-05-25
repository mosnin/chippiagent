import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { formatCurrency } from '@/lib/formatting';
import { formatPropertyAddress, formatPropertyFacts, PROPERTY_LISTING_STATUS_OPTIONS } from '@/lib/properties';
import { H1, TITLE_FONT, BODY_MUTED, CAPTION, PAGE_MAX } from '@/lib/typography';
import type { Property, PropertyListingStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Tailwind color tokens per listing status. */
function statusStyles(status: PropertyListingStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400';
    case 'pending':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400';
    case 'sold':
      return 'bg-muted text-muted-foreground';
    case 'off_market':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400';
    case 'owned':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function statusLabel(status: PropertyListingStatus): string {
  return PROPERTY_LISTING_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export default async function PropertiesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) redirect('/');

  let properties: Property[] = [];
  let fetchError = false;
  try {
    const { data, error } = await supabase
      .from('Property')
      .select('*')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false });
    if (error) throw error;
    properties = (data ?? []) as Property[];
  } catch (err) {
    console.error('[properties/page] DB query failed', { slug, error: err });
    fetchError = true;
  }

  if (fetchError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className={cn(BODY_MUTED)}>
            We couldn&apos;t load your properties. This is usually temporary.
          </p>
          <a
            href={`/s/${slug}/properties`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-foreground text-background hover:bg-foreground/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', PAGE_MAX)}>
      {/* Page header */}
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Properties.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          All properties
        </h1>
        <p className={cn(BODY_MUTED)}>
          {properties.length === 0
            ? 'No properties yet.'
            : `${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`}
        </p>
      </header>

      {/* Empty state */}
      {properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-12 text-center">
          <Building2 size={28} className="mx-auto mb-3 text-muted-foreground/60" />
          <p className="text-sm text-foreground font-medium">No properties yet.</p>
          <p className={cn('text-xs mt-1', BODY_MUTED)}>
            Properties are added when you create deals.
          </p>
          <Link
            href={`/s/${slug}/deals`}
            className="inline-flex items-center gap-1.5 mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Go to deals <ArrowRight size={12} />
          </Link>
        </div>
      ) : (
        /* Property grid */
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {properties.map((property) => {
            const addr = formatPropertyAddress(property);
            const facts = formatPropertyFacts(property);
            const cover = property.photos[0];

            return (
              <li key={property.id}>
                <Link
                  href={`/s/${slug}/properties/${property.id}`}
                  className="group flex flex-col rounded-lg border border-border/70 bg-card overflow-hidden hover:border-border hover:shadow-sm transition-all duration-150"
                >
                  {/* Photo or placeholder */}
                  <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <Building2 size={28} />
                      </div>
                    )}
                    {/* Status badge overlaid on image */}
                    <span
                      className={cn(
                        'absolute top-2 left-2 inline-flex items-center rounded-full px-2 py-0.5',
                        'text-[10px] font-semibold uppercase tracking-wider',
                        statusStyles(property.listingStatus),
                      )}
                    >
                      {statusLabel(property.listingStatus)}
                    </span>
                  </div>

                  {/* Card body */}
                  <div className="flex flex-col gap-1.5 p-3 flex-1">
                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                      {addr}
                    </p>

                    {facts && (
                      <p className={cn(CAPTION, 'leading-none')}>{facts}</p>
                    )}

                    {property.listPrice != null && (
                      <p className="text-base font-semibold tabular-nums text-foreground mt-auto pt-1">
                        {formatCurrency(property.listPrice)}
                      </p>
                    )}

                    {property.listPrice == null && (
                      <p className={cn(CAPTION, 'mt-auto pt-1 italic')}>Price not set</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
