import { notFound } from 'next/navigation';
import { Building2, Calendar, FileText, ExternalLink, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Property, PropertyPacket } from '@/lib/types';
import { formatCurrency } from '@/lib/formatting';
import { formatPropertyAddress, formatPropertyFacts } from '@/lib/properties';
import { PacketDocumentLink } from '@/components/packet/packet-document-link';

// This route is intentionally public (no Clerk gate). Access is gated by the
// token + the packet's expiry/revoked state.
export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ token: string }> }

export default async function PacketPage({ params }: Props) {
  const { token } = await params;

  const { data: packetRow } = await supabase
    .from('PropertyPacket')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!packetRow) notFound();
  const packet = packetRow as PropertyPacket;

  const now = new Date();
  const revoked = !!packet.revokedAt;
  const expired = packet.expiresAt ? new Date(packet.expiresAt) < now : false;

  if (revoked || expired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle size={28} className="mx-auto text-amber-500" />
          <h1 className="text-xl font-semibold">This link is no longer active</h1>
          <p className="text-sm text-muted-foreground">
            {revoked ? 'The sender has revoked this packet.' : 'The packet link has expired.'} Reach out to the sender for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  const { data: propertyRow } = await supabase
    .from('Property')
    .select('*')
    .eq('id', packet.propertyId)
    .maybeSingle();
  if (!propertyRow) notFound();
  const property = propertyRow as Property;

  // Best-effort view tracking. Non-blocking; a failure shouldn't take the
  // page down.
  void supabase
    .from('PropertyPacket')
    .update({ viewCount: packet.viewCount + 1, lastViewedAt: now.toISOString() })
    .eq('id', packet.id);

  const documentIds = packet.includeDocumentIds ?? [];
  const { data: docRows } = documentIds.length > 0
    ? await supabase
        .from('DealDocument')
        .select('id, label, kind, sizeBytes, contentType, createdAt')
        .in('id', documentIds)
        .eq('spaceId', packet.spaceId)
    : { data: [] };
  const docs = (docRows ?? []) as Array<{ id: string; label: string; kind: string; sizeBytes: number | null; contentType: string | null; createdAt: string }>;

  const addr = formatPropertyAddress(property);
  const facts = formatPropertyFacts(property);
  const cover = property.photos[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Listing packet</p>
          <h1 className="text-2xl font-semibold">{packet.name}</h1>
        </header>

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="w-full aspect-[16/9] object-cover" />
          ) : (
            <div className="w-full aspect-[16/9] bg-muted flex items-center justify-center">
              <Building2 size={36} className="text-muted-foreground" />
            </div>
          )}

          {property.photos.length > 1 && (
            <div className="grid grid-cols-4 gap-1 p-1">
              {property.photos.slice(1, 5).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="w-full aspect-square object-cover rounded" />
              ))}
            </div>
          )}

          <div className="p-5 space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{addr}</h2>
              {facts && <p className="text-sm text-muted-foreground mt-0.5">{facts}</p>}
            </div>
            {property.listPrice != null && (
              <p className="text-2xl font-semibold tabular-nums">{formatCurrency(property.listPrice)}</p>
            )}

            <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm pt-3 border-t border-border">
              {property.propertyType && <Row label="Type" value={property.propertyType.replace('_', ' ')} />}
              {property.yearBuilt != null && <Row label="Year built" value={String(property.yearBuilt)} />}
              {property.lotSizeSqft != null && <Row label="Lot" value={`${property.lotSizeSqft.toLocaleString()} sqft`} />}
              {property.mlsNumber && <Row label="MLS #" value={property.mlsNumber} />}
            </dl>

            {property.notes && (
              <div className="pt-3 border-t border-border">
                <p className="text-sm text-foreground whitespace-pre-wrap">{property.notes}</p>
              </div>
            )}

            {property.listingUrl && (
              <a href={property.listingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline">
                View original listing <ExternalLink size={12} />
              </a>
            )}
          </div>
        </section>

        {docs.length > 0 && (
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="px-5 py-3 border-b border-border flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold">Documents</h2>
              <span className="text-[11px] text-muted-foreground">{docs.length}</span>
            </header>
            <ul className="divide-y divide-border">
              {docs.map((d) => (
                <li key={d.id}>
                  <PacketDocumentLink token={token} docId={d.id} label={d.label} kind={d.kind} sizeBytes={d.sizeBytes} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="text-center text-[11px] text-muted-foreground pt-4 pb-10 flex items-center justify-center gap-2">
          <Calendar size={11} />
          {packet.expiresAt
            ? <>Expires {new Date(packet.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</>
            : 'No expiry'}
        </footer>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground mt-0.5">{value}</dd>
    </div>
  );
}
