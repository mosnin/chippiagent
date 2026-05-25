import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isValidSlug, normalizeSlug } from '@/lib/intake';
import { getOnboardingStatus, ensureOnboardingBackfill } from '@/lib/onboarding';
import { sendWelcomeEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { emit as emitTelemetry } from '@/lib/telemetry';
import type { User, Space, SpaceSetting } from '@/lib/types';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data: userData, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('clerkId', userId)
      .maybeSingle();
    if (userError) throw userError;

    const user = userData as User | null;

    if (!user) {
      return NextResponse.json({ step: 1, completed: false, user: null, space: null });
    }

    const { data: spaceData, error: spaceError } = await supabase
      .from('Space')
      .select('*')
      .eq('ownerId', user.id)
      .maybeSingle();
    if (spaceError) throw spaceError;
    const space = spaceData as Space | null;

    let settings: SpaceSetting | null = null;
    if (space) {
      const { data: settingsData, error: settingsError } = await supabase
        .from('SpaceSetting')
        .select('*')
        .eq('spaceId', space.id)
        .maybeSingle();
      if (settingsError) throw settingsError;
      settings = settingsData as SpaceSetting | null;
    }

    const userWithSpace = { ...user, space: space ? { ...space, settings } : null };

    try {
      await ensureOnboardingBackfill(userWithSpace);
    } catch (err) {
      console.error('[onboarding GET] backfill failed', err);
    }

    return NextResponse.json({
      step: user.onboardingCurrentStep,
      completed: getOnboardingStatus(user).isOnboarded,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        onboard: user.onboard,
        onboardingStartedAt: user.onboardingStartedAt,
        onboardingCompletedAt: user.onboardingCompletedAt
      },
      space: space
        ? {
            id: space.id,
            slug: space.slug,
            name: space.name,
            settings
          }
        : null
    });
  } catch (err) {
    console.error('[onboarding GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit: 30 onboarding actions per minute per user
  const { allowed } = await checkRateLimit(`onboarding:${userId}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { action } = body;

  try {
    // SELECT first — avoid calling currentUser() (a Clerk API round-trip) for existing users
    let user: User;
    const { data: existingData, error: existingError } = await supabase
      .from('User')
      .select('*')
      .eq('clerkId', userId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existingData) {
      user = existingData as User;
      // Backfill avatar from Clerk if not yet saved
      if (!user.avatar) {
        const clerkUser = await currentUser();
        if (clerkUser?.imageUrl) {
          await supabase
            .from('User')
            .update({ avatar: clerkUser.imageUrl })
            .eq('id', user.id);
          user = { ...user, avatar: clerkUser.imageUrl };
        }
      }
    } else {
      const clerkUser = await currentUser();
      const { data: insertedData, error: insertError } = await supabase
        .from('User')
        .upsert(
          {
            id: crypto.randomUUID(),
            clerkId: userId,
            email: clerkUser?.emailAddresses?.[0]?.emailAddress ?? '',
            name: clerkUser?.fullName ?? clerkUser?.firstName ?? null,
            avatar: clerkUser?.imageUrl ?? null,
            onboardingStartedAt: new Date().toISOString(),
            onboard: false,
          },
          { onConflict: 'clerkId' }
        )
        .select()
        .single();
      if (insertError) throw insertError;
      user = insertedData as User;
    }

    // Get space + settings separately
    const { data: spaceData, error: spaceError } = await supabase
      .from('Space')
      .select('*')
      .eq('ownerId', user.id)
      .maybeSingle();
    if (spaceError) throw spaceError;
    const space = spaceData as Space | null;

    let settings: SpaceSetting | null = null;
    if (space) {
      const { data: settingsData, error: settingsError } = await supabase
        .from('SpaceSetting')
        .select('*')
        .eq('spaceId', space.id)
        .maybeSingle();
      if (settingsError) throw settingsError;
      settings = settingsData as SpaceSetting | null;
    }

    const userWithSpace = { ...user, space: space ? { ...space, settings } : null };

    try {
      await ensureOnboardingBackfill(userWithSpace);
    } catch (err) {
      console.error('[onboarding POST] backfill failed', err);
    }

    if (action === 'start') {
      const { error } = await supabase
        .from('User')
        .update({
          onboard: false,
          onboardingCurrentStep: 1,
          onboardingStartedAt: user.onboardingStartedAt ?? new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'save_step') {
      const { step } = body as { step: number };
      const stepNum = typeof step === 'number' ? step : parseInt(String(step), 10);
      if (!Number.isInteger(stepNum) || stepNum < 1 || stepNum > 10) {
        return NextResponse.json({ error: 'Invalid step value' }, { status: 400 });
      }
      const { error } = await supabase
        .from('User')
        .update({
          onboardingCurrentStep: stepNum,
          onboardingStartedAt: user.onboardingStartedAt ?? new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'save_profile') {
      const { name, phone, phoneNumber, businessName } = body as {
        name: string;
        phone?: string;
        phoneNumber?: string;
        businessName: string;
      };
      const resolvedPhone = phone || phoneNumber || null;

      const { error: updateError } = await supabase
        .from('User')
        .update({ name: name || user.name })
        .eq('id', user.id);
      if (updateError) throw updateError;

      if (space) {
        const { error: settingsError } = await supabase
          .from('SpaceSetting')
          .upsert(
            {
              id: crypto.randomUUID(),
              spaceId: space.id,
              phoneNumber: resolvedPhone,
              businessName,
            },
            { onConflict: 'spaceId' }
          )
          .select();
        if (settingsError) throw settingsError;
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'create_space') {
      const {
        slug, intakePageTitle, intakePageIntro, businessName, logoUrl, realtorPhotoUrl,
        intakeAccentColor, intakeBorderRadius, intakeFont, intakeFooterLinks, bio, socialLinks,
        intakeDisabledSteps, intakeCustomQuestions, privacyPolicyHtml,
        intakeDarkMode, intakeHeaderBgColor, intakeHeaderGradient, intakeFaviconUrl,
        intakeVideoUrl, intakeThankYouTitle, intakeThankYouMessage,
        intakeConfirmationEmail, intakeDisclaimerText,
        // Enhanced onboarding fields (User record)
        phone, websiteUrl, mlsId, brokerageAffiliation,
        preferredNotification, timezone, referralSource, biggestPainPoint,
      } = body as {
        slug: string;
        intakePageTitle: string;
        intakePageIntro: string;
        businessName: string;
        logoUrl?: string | null;
        realtorPhotoUrl?: string | null;
        intakeAccentColor?: string;
        intakeBorderRadius?: 'rounded' | 'sharp';
        intakeFont?: 'system' | 'serif' | 'mono';
        intakeDarkMode?: boolean;
        intakeHeaderBgColor?: string | null;
        intakeHeaderGradient?: string | null;
        intakeFaviconUrl?: string | null;
        intakeVideoUrl?: string | null;
        intakeThankYouTitle?: string | null;
        intakeThankYouMessage?: string | null;
        intakeConfirmationEmail?: string | null;
        intakeDisclaimerText?: string | null;
        intakeFooterLinks?: { label: string; url: string }[];
        bio?: string | null;
        socialLinks?: { instagram?: string; linkedin?: string; facebook?: string; tiktok?: string };
        intakeDisabledSteps?: string[];
        intakeCustomQuestions?: { id: string; label: string; placeholder?: string; required?: boolean }[];
        privacyPolicyHtml?: string | null;
        phone?: string;
        websiteUrl?: string;
        mlsId?: string;
        brokerageAffiliation?: string;
        preferredNotification?: 'email' | 'sms' | 'both';
        timezone?: string;
        referralSource?: string;
        biggestPainPoint?: string;
      };

      // Block dangerous fields from being injected via request body
      const BLOCKED_FIELDS = ['platformRole', 'clerkId', 'id', 'createdAt', 'updatedAt'];
      for (const field of BLOCKED_FIELDS) {
        if (field in body) {
          return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }
      }

      if (!slug) return NextResponse.json({ error: 'Slug is required' }, { status: 400 });

      const sanitized = normalizeSlug(slug);
      if (!isValidSlug(slug) || sanitized !== slug) {
        return NextResponse.json({ error: 'Only lowercase letters, numbers, and hyphens allowed' }, { status: 400 });
      }

      // Build enhanced User updates
      const userUpdates: Record<string, unknown> = {};
      if (phone) userUpdates.phone = String(phone).slice(0, 40);
      if (bio) userUpdates.bio = String(bio).slice(0, 500);
      if (socialLinks && typeof socialLinks === 'object') {
        const allowed = ['instagram', 'linkedin', 'facebook', 'tiktok', 'twitter', 'youtube'];
        const sanitizedLinks: Record<string, string> = {};
        for (const key of allowed) {
          if (typeof (socialLinks as any)[key] === 'string') {
            sanitizedLinks[key] = String((socialLinks as any)[key]).slice(0, 500);
          }
        }
        userUpdates.socialLinks = sanitizedLinks;
      }
      if (websiteUrl) userUpdates.websiteUrl = String(websiteUrl).slice(0, 500);
      if (mlsId) userUpdates.mlsId = String(mlsId).slice(0, 50);
      if (brokerageAffiliation) userUpdates.brokerageAffiliation = String(brokerageAffiliation).slice(0, 200);
      if (preferredNotification) userUpdates.preferredNotification = preferredNotification;
      if (timezone) userUpdates.timezone = timezone;
      if (referralSource) userUpdates.referralSource = String(referralSource).slice(0, 100);
      if (biggestPainPoint) userUpdates.biggestPainPoint = String(biggestPainPoint).slice(0, 100);

      if (Object.keys(userUpdates).length > 0) {
        const { error: userUpdateErr } = await supabase
          .from('User')
          .update(userUpdates)
          .eq('id', user.id);
        if (userUpdateErr) {
          console.error('[onboarding] User enhanced fields update failed:', userUpdateErr);
        }
      }

      if (space) {
        const { error: settingsError } = await supabase
          .from('SpaceSetting')
          .upsert(
            {
              id: crypto.randomUUID(),
              spaceId: space.id,
              intakePageTitle,
              intakePageIntro,
              businessName,
              ...(logoUrl !== undefined && { logoUrl }),
              ...(realtorPhotoUrl !== undefined && { realtorPhotoUrl }),
              ...(intakeAccentColor !== undefined && { intakeAccentColor }),
              ...(intakeBorderRadius !== undefined && { intakeBorderRadius }),
              ...(intakeFont !== undefined && { intakeFont }),
              ...(intakeFooterLinks !== undefined && { intakeFooterLinks }),
              ...(bio !== undefined && { bio }),
              ...(socialLinks !== undefined && { socialLinks }),
              ...(intakeDisabledSteps !== undefined && { intakeDisabledSteps }),
              ...(intakeCustomQuestions !== undefined && { intakeCustomQuestions }),
              ...(privacyPolicyHtml !== undefined && { privacyPolicyHtml }),
              ...(intakeDarkMode !== undefined && { intakeDarkMode }),
              ...(intakeHeaderBgColor !== undefined && { intakeHeaderBgColor }),
              ...(intakeHeaderGradient !== undefined && { intakeHeaderGradient }),
              ...(intakeFaviconUrl !== undefined && { intakeFaviconUrl }),
              ...(intakeVideoUrl !== undefined && { intakeVideoUrl }),
              ...(intakeThankYouTitle !== undefined && { intakeThankYouTitle }),
              ...(intakeThankYouMessage !== undefined && { intakeThankYouMessage }),
              ...(intakeConfirmationEmail !== undefined && { intakeConfirmationEmail }),
              ...(intakeDisclaimerText !== undefined && { intakeDisclaimerText }),
              ...((preferredNotification === 'sms' || preferredNotification === 'both') && { smsNotifications: true }),
              ...(timezone && { timezone }),
            },
            { onConflict: 'spaceId' }
          )
          .select();
        if (settingsError) throw settingsError;
        return NextResponse.json({ success: true, slug: space.slug });
      }

      const { data: existingSlug, error: slugError } = await supabase
        .from('Space')
        .select('id')
        .eq('slug', sanitized)
        .maybeSingle();
      if (slugError) throw slugError;
      if (existingSlug) return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });

      const { data: existingOwnerSpace, error: ownerError } = await supabase
        .from('Space')
        .select('slug')
        .eq('ownerId', user.id)
        .maybeSingle();
      if (ownerError) throw ownerError;
      if (existingOwnerSpace) return NextResponse.json({ success: true, slug: existingOwnerSpace.slug });

      const DEFAULT_STAGES = [
        { name: 'New', color: '#94a3b8', position: 0 },
        { name: 'Reviewing', color: '#60a5fa', position: 1 },
        { name: 'Showing', color: '#a78bfa', position: 2 },
        { name: 'Applied', color: '#f59e0b', position: 3 },
        { name: 'Approved', color: '#22c55e', position: 4 },
        { name: 'Declined', color: '#ef4444', position: 5 }
      ];

      // Direct inserts instead of RPC — avoids UUID/TEXT type mismatch issues
      // and works without requiring the migration to be deployed first.
      const spaceId = crypto.randomUUID();
      const settingsId = crypto.randomUUID();

      // 1. Create the Space
      const { data: createdSpace, error: spaceInsertErr } = await supabase
        .from('Space')
        .insert({
          id: spaceId,
          slug: sanitized,
          name: businessName || sanitized,
          emoji: '\u{1F3E0}',
          ownerId: user.id,
        })
        .select()
        .single();

      if (spaceInsertErr) {
        // Check if user already owns a space (race condition)
        const { data: ownerSpace } = await supabase
          .from('Space').select('slug').eq('ownerId', user.id).maybeSingle();
        if (ownerSpace) return NextResponse.json({ success: true, slug: ownerSpace.slug });

        const errMsg = spaceInsertErr.message || '';
        if (errMsg.includes('duplicate key') || errMsg.includes('unique') || spaceInsertErr.code === '23505') {
          return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });
        }
        console.error('[onboarding] Space insert failed:', spaceInsertErr);
        return NextResponse.json({ error: 'Failed to create workspace. Please try again.' }, { status: 500 });
      }

      // 2. Create SpaceSetting
      const { error: settingsInsertErr } = await supabase
        .from('SpaceSetting')
        .insert({
          id: settingsId,
          spaceId,
          intakePageTitle: intakePageTitle || 'Rental Application',
          intakePageIntro: intakePageIntro || "Share a few details so I can review your rental fit faster.",
          businessName: businessName || '',
          ...(logoUrl !== undefined && { logoUrl }),
          ...(realtorPhotoUrl !== undefined && { realtorPhotoUrl }),
          ...((preferredNotification === 'sms' || preferredNotification === 'both') && { smsNotifications: true }),
          ...(timezone && { timezone }),
        });
      if (settingsInsertErr) {
        console.error('[onboarding] SpaceSetting insert failed:', settingsInsertErr);
        // Space was created — don't fail the whole flow for settings
      }

      // 3. Create default deal stages
      const stageRows = DEFAULT_STAGES.map((stage) => ({
        id: crypto.randomUUID(),
        spaceId,
        name: stage.name,
        color: stage.color,
        position: stage.position,
      }));
      const { error: stagesErr } = await supabase.from('DealStage').insert(stageRows);
      if (stagesErr) {
        console.error('[onboarding] DealStage insert failed:', stagesErr);
        // Non-fatal — stages can be created later
      }

      const newSpace = createdSpace as Space;

      const { error: stepError } = await supabase
        .from('User')
        .update({ onboardingCurrentStep: 4 })
        .eq('id', user.id);
      if (stepError) throw stepError;
      return NextResponse.json({ success: true, slug: newSpace.slug });
    }

    if (action === 'save_notifications') {
      const { emailNotifications, defaultSubmissionStatus } = body as {
        emailNotifications: boolean;
        defaultSubmissionStatus: string;
      };

      if (!space) return NextResponse.json({ error: 'No space found' }, { status: 400 });

      const { error: notifError } = await supabase
        .from('SpaceSetting')
        .upsert(
          {
            id: crypto.randomUUID(),
            spaceId: space.id,
            notifications: emailNotifications,
          },
          { onConflict: 'spaceId' }
        )
        .select();
      if (notifError) throw notifError;

      const { error: connError } = await supabase
        .from('SpaceSetting')
        .update({
          myConnections: JSON.stringify({ defaultSubmissionStatus: defaultSubmissionStatus || 'New' }),
        })
        .eq('spaceId', space.id);
      if (connError) throw connError;

      return NextResponse.json({ success: true });
    }

    if (action === 'skip') {
      // Mark user as onboarded without requiring a workspace
      // They'll be redirected to /setup to complete later
      const { error } = await supabase
        .from('User')
        .update({
          onboard: true,
          onboardingCurrentStep: 7,
          onboardingCompletedAt: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      return NextResponse.json({ success: true, redirect: '/setup' });
    }

    if (action === 'complete') {
      // If already onboarded, still update accountType if provided (for re-setup)
      if (user.onboard) {
        const accountType = (body as { accountType?: string }).accountType;
        if (accountType && ['realtor', 'broker_only', 'both'].includes(accountType)) {
          const { error: acctErr } = await supabase.from('User').update({ accountType }).eq('id', user.id);
          if (acctErr) console.error('[onboarding] accountType update failed', acctErr);
        }
        return NextResponse.json({
          success: true,
          onboard: true,
          onboardingCompletedAt: user.onboardingCompletedAt?.toISOString?.() ?? user.onboardingCompletedAt ?? new Date().toISOString()
        });
      }

      // Determine account type from request body
      const accountType = (body as { accountType?: string }).accountType;
      const isBrokerOnly = accountType === 'broker_only';

      // Broker-only users don't need a workspace
      if (!space && !isBrokerOnly) {
        return NextResponse.json(
          { error: 'Cannot complete onboarding without a workspace. Please create your workspace first.' },
          { status: 409 }
        );
      }

      const completedAt = new Date();
      const updatePayload: Record<string, unknown> = {
        onboard: true,
        onboardingCurrentStep: 7,
        onboardingCompletedAt: completedAt.toISOString(),
      };
      if (accountType && ['realtor', 'broker_only', 'both'].includes(accountType)) {
        updatePayload.accountType = accountType;
      }

      const { error } = await supabase
        .from('User')
        .update(updatePayload)
        .eq('id', user.id);
      if (error) throw error;

      // Phase 2 telemetry: fire signup_completed exactly when the user
      // transitions from non-onboarded to onboarded. The early-return path
      // above (already-onboarded re-setup) intentionally does NOT emit so
      // we don't double-count. Fire-and-forget — telemetry never blocks.
      void emitTelemetry({
        event: 'signup_completed',
        spaceId: space?.id ?? null,
        userId,
        payload: {
          slug: space?.slug ?? null,
          accountType: (updatePayload.accountType as string | undefined) ?? user.accountType ?? 'realtor',
          isBrokerOnly,
        },
      });

      // Send welcome email
      try {
        await sendWelcomeEmail({
          toEmail: user.email,
          userName: user.name,
          spaceName: space?.name ?? null,
          spaceSlug: space?.slug ?? null,
        });
      } catch (e) { console.error('[onboarding] welcome email failed:', e); }

      return NextResponse.json({ success: true, onboard: true, onboardingCompletedAt: completedAt.toISOString() });
    }

    if (action === 'save_realtor_profile') {
      // Persist the realtor's onboarding answers into AIUserProfile. Requires
      // a Space — the new flow creates the space first, then upserts this row.
      if (!space) {
        return NextResponse.json({ error: 'Workspace must exist first' }, { status: 409 });
      }

      const {
        role, zipCode, yearsExperience, businessFocus,
        communicationTone, quirksAndPreferences, leadSources,
      } = body as {
        role?: string;
        zipCode?: string;
        yearsExperience?: number;
        businessFocus?: string[];
        communicationTone?: string;
        quirksAndPreferences?: string;
        leadSources?: string[];
      };

      const ALLOWED_ROLES = ['solo', 'team_lead', 'brokerage_owner'];
      const ALLOWED_TONES = ['warm', 'direct', 'formal', 'casual'];

      // Whitelist enum-style fields; truncate strings; coerce arrays to plain
      // string[] to defend against unexpected payload shapes.
      const profileUpdate: Record<string, unknown> = {};
      if (role && ALLOWED_ROLES.includes(role)) profileUpdate.role = role;
      if (typeof zipCode === 'string') profileUpdate.zipCode = zipCode.trim().slice(0, 12);
      if (typeof yearsExperience === 'number' && Number.isFinite(yearsExperience)) {
        profileUpdate.yearsExperience = Math.max(0, Math.min(100, Math.trunc(yearsExperience)));
      }
      if (Array.isArray(businessFocus)) {
        profileUpdate.businessFocus = businessFocus.filter((s) => typeof s === 'string').slice(0, 8);
      }
      if (communicationTone && ALLOWED_TONES.includes(communicationTone)) {
        profileUpdate.communicationTone = communicationTone;
      }
      if (typeof quirksAndPreferences === 'string') {
        profileUpdate.quirksAndPreferences = quirksAndPreferences.slice(0, 1000);
      }
      if (Array.isArray(leadSources)) {
        profileUpdate.leadSources = leadSources.filter((s) => typeof s === 'string').slice(0, 20);
      }

      const { error: profileErr } = await supabase
        .from('AIUserProfile')
        .upsert(
          {
            id: crypto.randomUUID(),
            spaceId: space.id,
            displayName: user.name ?? null,
            ...profileUpdate,
            updatedAt: new Date().toISOString(),
          },
          { onConflict: 'spaceId' },
        );
      if (profileErr) {
        console.error('[onboarding] AIUserProfile upsert failed:', profileErr);
        return NextResponse.json({ error: 'Could not save profile' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'check_slug') {
      const { slug } = body as { slug: string };
      if (!slug) return NextResponse.json({ available: false });
      const sanitized = normalizeSlug(slug);
      if (!isValidSlug(slug) || sanitized !== slug) {
        return NextResponse.json({ available: false, reason: 'invalid' });
      }
      const { data: existingSlug, error: slugError } = await supabase
        .from('Space')
        .select('id')
        .eq('slug', sanitized)
        .maybeSingle();
      if (slugError) throw slugError;
      return NextResponse.json({ available: !existingSlug });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[onboarding POST] action:', action, err);
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
