/**
 * Public realtor page — the "link in bio" surface at /p/[slug].
 *
 * No auth (same pattern as /apply/[slug] and /book/[slug]): resolve the
 * Space by slug, read branding from SpaceSetting, the page config from
 * ProfilePage, and — when enabled — the space's active listings. The
 * render lives in <PublicProfile/>.
 */

import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { PublicProfile, type PublicProperty } from '@/components/profile-page/public-profile';

export const revalidate = 60;

interface ProfileConfig {
  enabled: boolean;
  headline: string | null;
  showIntake: boolean;
  showTours: boolean;
  showProperties: boolean;
  customLinks: Array<{ id: string; label: string; url: string; thumbnail?: string }>;
  videos: Array<{ id: string; url: string; title?: string }>;
}

const DEFAULT_CONFIG: ProfileConfig = {
  enabled: true,
  headline: null,
  showIntake: true,
  showTours: true,
  showProperties: true,
  customLinks: [],
  videos: [],
};

export default async function PublicRealtorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: settings }, { data: owner }, { data: profileRow }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select(
        'businessName, logoUrl, realtorPhotoUrl, bio, socialLinks, intakeAccentColor, intakeDarkMode',
      )
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase.from('User').select('name, avatar').eq('id', space.ownerId).maybeSingle(),
    supabase
      .from('ProfilePage')
      .select(
        'enabled, headline, showIntake, showTours, showProperties, customLinks, videos',
      )
      .eq('spaceId', space.id)
      .maybeSingle(),
  ]);

  // No row yet = sensible defaults (the page works before the realtor edits
  // it). enabled === false means they've explicitly unpublished it.
  const cfg: ProfileConfig = { ...DEFAULT_CONFIG, ...((profileRow ?? {}) as Partial<ProfileConfig>) };
  if (cfg.enabled === false) notFound();

  let properties: PublicProperty[] = [];
  if (cfg.showProperties) {
    const { data } = await supabase
      .from('Property')
      .select('id, address, city, stateRegion, listPrice, photos, listingUrl')
      .eq('spaceId', space.id)
      .eq('listingStatus', 'active')
      .order('updatedAt', { ascending: false })
      .limit(6);
    properties = ((data ?? []) as PublicProperty[]);
  }

  const subStatus = space.stripeSubscriptionStatus;
  const hidePoweredBy = subStatus === 'active' || subStatus === 'trialing';

  const businessName = settings?.businessName || space.name;

  return (
    <PublicProfile
      slug={slug}
      businessName={businessName}
      logoUrl={settings?.logoUrl || null}
      agentName={owner?.name || businessName}
      agentPhoto={settings?.realtorPhotoUrl || owner?.avatar || null}
      bio={settings?.bio || null}
      headline={cfg.headline}
      socialLinks={(settings?.socialLinks as Record<string, string> | null) ?? null}
      accentColor={(settings?.intakeAccentColor as string | null) || '#ff964f'}
      darkMode={settings?.intakeDarkMode === true}
      showIntake={cfg.showIntake !== false}
      showTours={cfg.showTours !== false}
      customLinks={Array.isArray(cfg.customLinks) ? cfg.customLinks : []}
      videos={Array.isArray(cfg.videos) ? cfg.videos : []}
      properties={properties}
      hidePoweredBy={hidePoweredBy}
    />
  );
}
