import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { getSpaceForUser } from '@/lib/space';
import crypto from 'crypto';
import { audit } from '@/lib/audit';
import { isValidSlug, normalizeSlug } from '@/lib/intake';
import type { SpaceSetting } from '@/lib/types';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.slug !== slug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [settingsRes, ownerRes] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select(
        'notifications, smsNotifications, notifyNewLeads, notifyTourBookings, notifyNewDeals, notifyFollowUps, phoneNumber,' +
        'bio, socialLinks, businessName, realtorPhotoUrl, privacyPolicyHtml,' +
        'intakeAccentColor, intakeBorderRadius, intakeFont, intakeDarkMode,' +
        'intakeHeaderBgColor, intakeHeaderGradient, intakeFaviconUrl, logoUrl,' +
        'intakePageTitle, intakePageIntro, intakeVideoUrl,' +
        'intakeThankYouTitle, intakeThankYouMessage, intakeConfirmationEmail,' +
        'intakeDisclaimerText, intakeFooterLinks,' +
        'myConnections'
      )
      .eq('spaceId', userSpace.id)
      .maybeSingle(),
    supabase
      .from('User')
      .select('email')
      .eq('id', userSpace.ownerId)
      .maybeSingle(),
  ]);
  // Supabase's string-based `.select(...)` can't be inferred by TS, so the
  // response `data` narrows to `GenericStringError`. Cast to the shape we
  // actually read; `??` fallbacks below handle nulls.
  const settings = settingsRes.data as (Partial<SpaceSetting> & {
    logoUrl?: string | null;
    realtorPhotoUrl?: string | null;
  }) | null;
  const owner = ownerRes.data as { email: string } | null;

  return NextResponse.json({
    settings: {
      // Notification settings
      notifications: settings?.notifications ?? true,
      smsNotifications: settings?.smsNotifications ?? false,
      notifyNewLeads: settings?.notifyNewLeads ?? true,
      notifyTourBookings: settings?.notifyTourBookings ?? true,
      notifyNewDeals: settings?.notifyNewDeals ?? true,
      notifyFollowUps: settings?.notifyFollowUps ?? true,
      phoneNumber: settings?.phoneNumber ?? '',
      myConnections: settings?.myConnections ?? '',
      // Profile settings
      bio: settings?.bio ?? '',
      socialLinks: settings?.socialLinks ?? { instagram: '', linkedin: '', facebook: '' },
      businessName: settings?.businessName ?? '',
      realtorPhotoUrl: settings?.realtorPhotoUrl ?? '',
      privacyPolicyHtml: settings?.privacyPolicyHtml ?? '',
      // Appearance settings
      intakeAccentColor: settings?.intakeAccentColor ?? '#ff964f',
      intakeBorderRadius: settings?.intakeBorderRadius ?? 'rounded',
      intakeFont: settings?.intakeFont ?? 'system',
      intakeDarkMode: settings?.intakeDarkMode ?? false,
      intakeHeaderBgColor: settings?.intakeHeaderBgColor ?? '',
      intakeHeaderGradient: settings?.intakeHeaderGradient ?? '',
      intakeFaviconUrl: settings?.intakeFaviconUrl ?? '',
      logoUrl: settings?.logoUrl ?? '',
      // Content settings
      intakePageTitle: settings?.intakePageTitle ?? 'Rental Application',
      intakePageIntro: settings?.intakePageIntro ?? '',
      intakeVideoUrl: settings?.intakeVideoUrl ?? '',
      intakeThankYouTitle: settings?.intakeThankYouTitle ?? '',
      intakeThankYouMessage: settings?.intakeThankYouMessage ?? '',
      intakeConfirmationEmail: settings?.intakeConfirmationEmail ?? '',
      intakeDisclaimerText: settings?.intakeDisclaimerText ?? '',
      intakeFooterLinks: settings?.intakeFooterLinks ?? [],
    },
    ownerEmail: owner?.email ?? '',
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    slug,
    emoji,
    notifications,
    smsNotifications,
    notifyNewLeads,
    notifyTourBookings,
    notifyNewDeals,
    notifyFollowUps,
  } = body;

  // Sanitize and cap all free-text fields to prevent storage DoS and injection
  // name: use undefined when absent so we can skip it; empty string is a valid (cleared) name
  const name            = typeof body.name            === 'string' ? body.name.slice(0, 100)            : undefined;
  // phoneNumber: use undefined (not null) when absent so we can skip it in the upsert
  const phoneNumber     = typeof body.phoneNumber     === 'string' ? body.phoneNumber.slice(0, 50)       : undefined;
  const myConnections   = typeof body.myConnections   === 'string' ? body.myConnections.slice(0, 500)    : undefined;
  const aiPersonalization = typeof body.aiPersonalization === 'string' ? body.aiPersonalization.slice(0, 1000) : undefined;
  const billingSettings = typeof body.billingSettings === 'string' ? body.billingSettings.slice(0, 2000) : undefined;
  const bio             = typeof body.bio             === 'string' ? body.bio.slice(0, 500)             : undefined;
  const socialLinks     = body.socialLinks && typeof body.socialLinks === 'object' ? body.socialLinks    : undefined;
  const logoUrl         = typeof body.logoUrl         === 'string' ? body.logoUrl.slice(0, 500)         : undefined;
  const realtorPhotoUrl = typeof body.realtorPhotoUrl === 'string' ? body.realtorPhotoUrl.slice(0, 500)  : undefined;
  const businessName    = typeof body.businessName    === 'string' ? body.businessName.slice(0, 200)     : undefined;
  // Appearance fields
  const intakeAccentColor    = typeof body.intakeAccentColor    === 'string' ? body.intakeAccentColor.slice(0, 50)    : undefined;
  const intakeBorderRadius   = body.intakeBorderRadius === 'rounded' || body.intakeBorderRadius === 'sharp' ? body.intakeBorderRadius : undefined;
  const intakeFont           = body.intakeFont === 'system' || body.intakeFont === 'serif' || body.intakeFont === 'mono' ? body.intakeFont : undefined;
  const intakeDarkMode       = typeof body.intakeDarkMode === 'boolean' ? body.intakeDarkMode : undefined;
  const intakeHeaderBgColor  = typeof body.intakeHeaderBgColor  === 'string' ? body.intakeHeaderBgColor.slice(0, 100)  : (body.intakeHeaderBgColor === null ? null : undefined);
  const intakeHeaderGradient = typeof body.intakeHeaderGradient === 'string' ? body.intakeHeaderGradient.slice(0, 200) : (body.intakeHeaderGradient === null ? null : undefined);
  const intakeFaviconUrl     = typeof body.intakeFaviconUrl     === 'string' ? body.intakeFaviconUrl.slice(0, 500)     : (body.intakeFaviconUrl === null ? null : undefined);
  // Content fields
  const intakePageTitle         = typeof body.intakePageTitle         === 'string' ? body.intakePageTitle.slice(0, 200)         : undefined;
  const intakePageIntro         = typeof body.intakePageIntro         === 'string' ? body.intakePageIntro.slice(0, 500)         : undefined;
  const intakeVideoUrl          = typeof body.intakeVideoUrl          === 'string' ? body.intakeVideoUrl.slice(0, 500)          : (body.intakeVideoUrl === null ? null : undefined);
  const intakeThankYouTitle     = typeof body.intakeThankYouTitle     === 'string' ? body.intakeThankYouTitle.slice(0, 200)     : (body.intakeThankYouTitle === null ? null : undefined);
  const intakeThankYouMessage   = typeof body.intakeThankYouMessage   === 'string' ? body.intakeThankYouMessage.slice(0, 2000)  : (body.intakeThankYouMessage === null ? null : undefined);
  const intakeConfirmationEmail = typeof body.intakeConfirmationEmail === 'string' ? body.intakeConfirmationEmail.slice(0, 5000) : (body.intakeConfirmationEmail === null ? null : undefined);
  const intakeDisclaimerText    = typeof body.intakeDisclaimerText    === 'string' ? body.intakeDisclaimerText.slice(0, 2000)   : (body.intakeDisclaimerText === null ? null : undefined);
  const intakeFooterLinks       = Array.isArray(body.intakeFooterLinks) ? body.intakeFooterLinks : undefined;
  // Trust signals — three optional compliance slots rendered in the intake footer.
  // License number: short identifier; cap conservatively. Fair housing notice:
  // multi-line text; cap at 2KB. Mark: boolean.
  const intakeLicenseNumber         = typeof body.intakeLicenseNumber === 'string' ? body.intakeLicenseNumber.trim().slice(0, 200) : (body.intakeLicenseNumber === null ? null : undefined);
  const intakeFairHousingNotice     = typeof body.intakeFairHousingNotice === 'string' ? body.intakeFairHousingNotice.slice(0, 2000) : (body.intakeFairHousingNotice === null ? null : undefined);
  const intakeShowEqualHousingMark  = typeof body.intakeShowEqualHousingMark === 'boolean' ? body.intakeShowEqualHousingMark : undefined;

  // Legal & compliance fields
  const rawPrivacyPolicyUrl = typeof body.privacyPolicyUrl === 'string' ? body.privacyPolicyUrl.trim().slice(0, 500) : undefined;
  const consentCheckboxLabel = typeof body.consentCheckboxLabel === 'string' ? body.consentCheckboxLabel.trim().slice(0, 500) : undefined;
  // Privacy Policy HTML (rich text content, capped at 100KB)
  const privacyPolicyHtml = body.privacyPolicyHtml !== undefined
    ? (typeof body.privacyPolicyHtml === 'string' ? body.privacyPolicyHtml.slice(0, 100_000) : null)
    : undefined;

  // Validate privacy policy URL if provided
  if (rawPrivacyPolicyUrl !== undefined && rawPrivacyPolicyUrl !== null && rawPrivacyPolicyUrl !== '') {
    try {
      const purl = new URL(rawPrivacyPolicyUrl);
      if (purl.protocol !== 'https:') {
        return NextResponse.json({ error: 'Privacy policy URL must use HTTPS' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Privacy policy URL is not a valid URL' }, { status: 400 });
    }
  }

  const { data: spaceRows, error: spaceError } = await supabase
    .from('Space')
    .select('id, slug, name, emoji, createdAt, ownerId')
    .eq('slug', slug);
  if (spaceError) {
    console.error('[PATCH /api/spaces] Space lookup error:', spaceError);
    return NextResponse.json({ error: 'Database error. Please try again.' }, { status: 500 });
  }
  if (!spaceRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = spaceRows[0];

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updateFields: Record<string, unknown> = {};
  if (name !== undefined) updateFields.name = name;
  if (emoji !== undefined) updateFields.emoji = emoji;
  if (body.brokerageId && typeof body.brokerageId === 'string') {
    updateFields.brokerageId = body.brokerageId;
  }

  // Handle slug change
  const rawNewSlug = typeof body.newSlug === 'string' ? body.newSlug.trim() : '';
  if (rawNewSlug && rawNewSlug !== slug) {
    const sanitized = normalizeSlug(rawNewSlug);
    if (!isValidSlug(sanitized) || sanitized !== rawNewSlug) {
      return NextResponse.json({ error: 'Only lowercase letters, numbers, and hyphens allowed (min 3 chars)' }, { status: 400 });
    }
    // Check uniqueness
    const { data: existing } = await supabase
      .from('Space')
      .select('id')
      .eq('slug', sanitized)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });
    }
    updateFields.slug = sanitized;
  }

  let updatedRows: any[];
  if (Object.keys(updateFields).length > 0) {
    const { data, error: updateError } = await supabase
      .from('Space')
      .update(updateFields)
      .eq('slug', slug)
      .select('id, slug, name, emoji, createdAt, ownerId');
    if (updateError) {
      const errMsg = updateError.message || '';
      if (errMsg.includes('duplicate key') || errMsg.includes('unique') || updateError.code === '23505') {
        return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });
      }
      console.error('[PATCH /api/spaces] Space update error:', updateError);
      return NextResponse.json({ error: 'Database error. Please try again.' }, { status: 500 });
    }
    updatedRows = data!;
  } else {
    updatedRows = [space];
  }

  // Only include fields that were actually provided in the request body
  // to prevent partial saves (e.g., notifications page) from wiping out
  // fields managed by other forms (e.g., phone number from general settings).
  const settingsPayload: Record<string, unknown> = {
    id: crypto.randomUUID(),
    spaceId: space.id,
  };
  if (typeof notifications === 'boolean') settingsPayload.notifications = notifications;
  if (typeof smsNotifications === 'boolean') settingsPayload.smsNotifications = smsNotifications;
  if (typeof notifyNewLeads === 'boolean') settingsPayload.notifyNewLeads = notifyNewLeads;
  if (typeof notifyTourBookings === 'boolean') settingsPayload.notifyTourBookings = notifyTourBookings;
  if (typeof notifyNewDeals === 'boolean') settingsPayload.notifyNewDeals = notifyNewDeals;
  if (typeof notifyFollowUps === 'boolean') settingsPayload.notifyFollowUps = notifyFollowUps;
  if (phoneNumber !== undefined) settingsPayload.phoneNumber = phoneNumber;
  if (myConnections !== undefined) settingsPayload.myConnections = myConnections;
  if (aiPersonalization !== undefined) settingsPayload.aiPersonalization = aiPersonalization;
  if (billingSettings !== undefined) settingsPayload.billingSettings = billingSettings;
  if (bio !== undefined) settingsPayload.bio = bio;
  if (socialLinks !== undefined) settingsPayload.socialLinks = socialLinks;
  if (logoUrl !== undefined) settingsPayload.logoUrl = logoUrl;
  if (realtorPhotoUrl !== undefined) settingsPayload.realtorPhotoUrl = realtorPhotoUrl;
  if (businessName !== undefined) settingsPayload.businessName = businessName;
  if (rawPrivacyPolicyUrl !== undefined) settingsPayload.privacyPolicyUrl = rawPrivacyPolicyUrl || null;
  if (consentCheckboxLabel !== undefined) settingsPayload.consentCheckboxLabel = consentCheckboxLabel || null;
  if (privacyPolicyHtml !== undefined) settingsPayload.privacyPolicyHtml = privacyPolicyHtml || null;
  // Appearance fields
  if (intakeAccentColor !== undefined) settingsPayload.intakeAccentColor = intakeAccentColor;
  if (intakeBorderRadius !== undefined) settingsPayload.intakeBorderRadius = intakeBorderRadius;
  if (intakeFont !== undefined) settingsPayload.intakeFont = intakeFont;
  if (intakeDarkMode !== undefined) settingsPayload.intakeDarkMode = intakeDarkMode;
  if (intakeHeaderBgColor !== undefined) settingsPayload.intakeHeaderBgColor = intakeHeaderBgColor;
  if (intakeHeaderGradient !== undefined) settingsPayload.intakeHeaderGradient = intakeHeaderGradient;
  if (intakeFaviconUrl !== undefined) settingsPayload.intakeFaviconUrl = intakeFaviconUrl;
  // Content fields
  if (intakePageTitle !== undefined) settingsPayload.intakePageTitle = intakePageTitle;
  if (intakePageIntro !== undefined) settingsPayload.intakePageIntro = intakePageIntro;
  if (intakeVideoUrl !== undefined) settingsPayload.intakeVideoUrl = intakeVideoUrl;
  if (intakeThankYouTitle !== undefined) settingsPayload.intakeThankYouTitle = intakeThankYouTitle;
  if (intakeThankYouMessage !== undefined) settingsPayload.intakeThankYouMessage = intakeThankYouMessage;
  if (intakeConfirmationEmail !== undefined) settingsPayload.intakeConfirmationEmail = intakeConfirmationEmail;
  if (intakeDisclaimerText !== undefined) settingsPayload.intakeDisclaimerText = intakeDisclaimerText;
  if (intakeFooterLinks !== undefined) settingsPayload.intakeFooterLinks = intakeFooterLinks;
  // Trust signals
  if (intakeLicenseNumber !== undefined) settingsPayload.intakeLicenseNumber = intakeLicenseNumber || null;
  if (intakeFairHousingNotice !== undefined) settingsPayload.intakeFairHousingNotice = intakeFairHousingNotice || null;
  if (intakeShowEqualHousingMark !== undefined) settingsPayload.intakeShowEqualHousingMark = intakeShowEqualHousingMark;

  // Tour availability settings
  if (typeof body.tourDuration === 'number' && [15, 30, 45, 60, 90, 120].includes(body.tourDuration)) {
    settingsPayload.tourDuration = body.tourDuration;
  }
  if (typeof body.tourBufferMinutes === 'number' && [0, 15, 30, 45, 60].includes(body.tourBufferMinutes)) {
    settingsPayload.tourBufferMinutes = body.tourBufferMinutes;
  }
  if (typeof body.tourStartHour === 'number' && body.tourStartHour >= 0 && body.tourStartHour <= 23) {
    settingsPayload.tourStartHour = body.tourStartHour;
  }
  if (typeof body.tourEndHour === 'number' && body.tourEndHour >= 1 && body.tourEndHour <= 24) {
    settingsPayload.tourEndHour = body.tourEndHour;
  }
  if (Array.isArray(body.tourDaysAvailable)) {
    const validDays = body.tourDaysAvailable.filter((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6);
    settingsPayload.tourDaysAvailable = validDays;
  }
  if (Array.isArray(body.tourBlockedDates)) {
    const validDates = body.tourBlockedDates.filter((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d as string));
    settingsPayload.tourBlockedDates = validDates;
  }

  const { error: settingsError } = await supabase
    .from('SpaceSetting')
    .upsert(settingsPayload, { onConflict: 'spaceId' })
    .select();
  if (settingsError) {
    console.error('[PATCH /api/spaces] Settings upsert error:', settingsError);
    return NextResponse.json({ error: 'Failed to save settings. Please try again.' }, { status: 500 });
  }

  // Update Redis cache
  const updatedSpace = updatedRows![0];
  const existing = await redis.get<any>(`slug:${slug}`).catch(() => null);
  if (existing) {
    // If slug changed, delete old key and set new one
    if (updatedSpace.slug !== slug) {
      await redis.del(`slug:${slug}`).catch(() => null);
      await redis.set(`slug:${updatedSpace.slug}`, { ...existing, slug: updatedSpace.slug, emoji: updatedSpace.emoji }).catch(() => null);
    } else {
      await redis.set(`slug:${slug}`, { ...existing, emoji }).catch(() => null);
    }
  }

  void audit({ actorClerkId: userId, action: 'UPDATE', resource: 'Space', resourceId: space.id, spaceId: space.id, req, metadata: updatedSpace.slug !== slug ? { oldSlug: slug, newSlug: updatedSpace.slug } : undefined });

  return NextResponse.json(updatedSpace);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let slug: string;
  try {
    const body = await req.json();
    slug = body.slug;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

  const { data: spaceRows, error: spaceError } = await supabase
    .from('Space')
    .select('id, slug, name, emoji, createdAt, ownerId')
    .eq('slug', slug);
  if (spaceError) {
    console.error('[DELETE /api/spaces] Space lookup error:', spaceError);
    return NextResponse.json({ error: 'Database error. Please try again.' }, { status: 500 });
  }
  if (!spaceRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = spaceRows[0];

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await redis.del(`slug:${slug}`).catch(() => null);

  // Audit BEFORE delete so we still have the spaceId in the log
  void audit({
    actorClerkId: userId,
    action: 'DELETE',
    resource: 'Space',
    resourceId: space.id,
    spaceId: space.id,
    req,
    metadata: { slug: space.slug, name: space.name },
  });

  const { error: deleteError } = await supabase
    .from('Space')
    .delete()
    .eq('slug', slug);
  if (deleteError) {
    console.error('[DELETE /api/spaces] Delete error:', deleteError);
    return NextResponse.json({ error: 'Failed to delete workspace. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
