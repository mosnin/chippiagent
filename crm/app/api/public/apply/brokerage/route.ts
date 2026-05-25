import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { scoreLeadApplicationDynamic } from '@/lib/lead-scoring';
import type { LeadScoringResult } from '@/lib/lead-scoring';
import type { Contact, IntakeFormConfig } from '@/lib/types';
import {
  applicationFingerprintKey,
  buildApplicationData,
  normalizePhone,
  publicApplicationSchema,
} from '@/lib/public-application';
import { notifyBroker } from '@/lib/broker-notify';
import { notificationForNewBrokerageLead } from '@/lib/notification-voice';
import { sendApplicationConfirmation } from '@/lib/email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { getFormConfigs, getDefaultFormConfig } from '@/lib/form-builder';
import { formConfigSchema, type FormQuestion } from '@/lib/form-config-schema';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';
import { logger } from '@/lib/logger';
import { routeBrokerageLead } from '@/lib/brokerage-routing';

/** Parse budget/rent range strings to a midpoint number for the DB. */
function parseBudgetToNumber(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  const s = String(val).toLowerCase().trim();
  if (!s) return null;
  const direct = Number(s);
  if (!isNaN(direct) && direct > 0) return direct;
  const underMatch = s.match(/^under[_\s]?(\d+)/);
  if (underMatch) return Math.round(Number(underMatch[1]) * 0.8);
  const rangeMatch = s.match(/^(\d+)[k]?[_\s-]+(\d+)[k]?$/);
  if (rangeMatch) {
    let lo = Number(rangeMatch[1]);
    let hi = Number(rangeMatch[2]);
    if (s.includes('k')) { lo *= 1000; hi *= 1000; }
    return Math.round((lo + hi) / 2);
  }
  const plusMatch = s.match(/^(\d+)[k]?[_\s]?(?:plus|\+)$/);
  if (plusMatch) {
    let base = Number(plusMatch[1]);
    if (s.includes('k') || s.includes('m')) base *= 1000;
    if (s.startsWith('1m')) return 1250000;
    return Math.round(base * 1.2);
  }
  return null;
}

/**
 * Brokerage-specific intake schema.
 * Same as the regular application schema but uses `brokerageId` instead of `slug`.
 */
const brokerageApplicationSchema = publicApplicationSchema
  .omit({ slug: true })
  .extend({
    brokerageId: z.string().uuid('Invalid brokerage ID'),
  });

// ── Dynamic form config helpers (mirrors main apply route) ──────────────

/**
 * Resolve the correct form config for a brokerage submission.
 *
 * Fallback chain:
 *   1. Brokerage dual config: [brokerageRentalFormConfig | brokerageBuyerFormConfig]
 *   2. Brokerage legacy: brokerageFormConfig (if leadType matches)
 *   3. Space dual config: [rentalFormConfig | buyerFormConfig]
 *   4. Space legacy: formConfig (if leadType matches)
 *   5. null (use legacy scoring)
 */
async function fetchBrokerageFormConfig(
  brokerageId: string,
  spaceId: string,
  leadType: 'rental' | 'buyer',
): Promise<IntakeFormConfig | null> {
  try {
    // First try brokerage-level configs directly
    const { data: brokerage } = await supabase
      .from('Brokerage')
      .select('"brokerageFormConfig", "brokerageRentalFormConfig", "brokerageBuyerFormConfig"')
      .eq('id', brokerageId)
      .maybeSingle();

    if (brokerage) {
      // Try dual config first
      const dualRaw = leadType === 'buyer'
        ? brokerage.brokerageBuyerFormConfig
        : brokerage.brokerageRentalFormConfig;
      if (dualRaw) {
        const parsed = formConfigSchema.safeParse(dualRaw);
        if (parsed.success) return parsed.data;
      }

      // Try legacy single config
      if (brokerage.brokerageFormConfig) {
        const parsed = formConfigSchema.safeParse(brokerage.brokerageFormConfig);
        if (parsed.success) {
          const configLeadType = parsed.data.leadType;
          if (configLeadType === leadType || configLeadType === 'general') {
            return parsed.data;
          }
        }
      }
    }

    // Fall back to space-level configs
    const dual = await getFormConfigs(spaceId, brokerageId);
    const spaceConfig = leadType === 'buyer' ? dual.buyer : dual.rental;
    if (spaceConfig) return spaceConfig;
  } catch (err) {
    logger.warn('[apply/brokerage] form config fetch failed', { brokerageId, spaceId, leadType }, err);
  }

  return null;
}

type VisibilityCondition = {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains';
  value: string;
} | undefined;

function evaluateVisibility(
  condition: VisibilityCondition,
  answers: Record<string, unknown>,
): boolean {
  if (!condition) return true;

  const raw = answers[condition.questionId];
  const currentValue = Array.isArray(raw)
    ? raw.join(',')
    : raw == null
      ? ''
      : String(raw);

  switch (condition.operator) {
    case 'equals':
      return currentValue === condition.value;
    case 'not_equals':
      return currentValue !== condition.value;
    case 'contains':
      return currentValue.includes(condition.value);
    default:
      return true;
  }
}

/**
 * Build a visibility-aware Zod schema from the IntakeFormConfig.
 * Required fields are only enforced when the corresponding section/question
 * is visible for the current submission.
 */
function buildDynamicSchemaForSubmission(
  config: IntakeFormConfig,
  submission: Record<string, unknown>,
) {
  const shape: Record<string, z.ZodTypeAny> = {
    brokerageId: z.string().uuid(),
  };

  const allQuestions: FormQuestion[] = [];
  for (const section of config.sections) {
    const sectionVisible = evaluateVisibility(section.visibleWhen, submission);

    for (const question of section.questions) {
      allQuestions.push(question);

      let fieldSchema: z.ZodTypeAny;
      const required =
        sectionVisible &&
        evaluateVisibility(question.visibleWhen, submission) &&
        question.required;

      switch (question.type) {
        case 'email': {
          // Coerce booleans to string to handle edge cases like privacyConsent:true
          // being sent in a field that shares an ID with a string-type question.
          const emailBase = required
            ? z.string().trim().min(1).email().max(255)
            : z.string().trim().email().max(255).optional().or(z.literal(''));
          fieldSchema = z.preprocess((v) => (typeof v === 'boolean' ? String(v) : v), emailBase);
          break;
        }
        case 'phone': {
          const phoneBase = required
            ? z.string().trim().min(1).max(40)
            : z.string().trim().max(40).optional().or(z.literal(''));
          fieldSchema = z.preprocess((v) => (typeof v === 'boolean' ? String(v) : v), phoneBase);
          break;
        }
        case 'number':
          fieldSchema = required
            ? z.union([z.number(), z.string()]).pipe(z.coerce.number())
            : z.union([z.number(), z.string(), z.null(), z.undefined()]).optional();
          break;
        case 'checkbox': {
          // The question-renderer stores checkbox values as strings ('true'/'false').
          // Coerce both string and boolean representations to boolean.
          const boolCoerce = z.preprocess(
            (v) => {
              if (typeof v === 'boolean') return v;
              if (v === 'true' || v === '1') return true;
              if (v === 'false' || v === '0' || v === '' || v == null) return false;
              return v;
            },
            z.boolean(),
          );
          fieldSchema = required ? boolCoerce : boolCoerce.optional();
          break;
        }
        case 'multi_select':
          fieldSchema = required
            ? z.array(z.string()).min(1)
            : z.array(z.string()).optional();
          break;
        case 'date':
        case 'text':
        case 'textarea':
        case 'select':
        case 'radio':
        default: {
          // Coerce booleans to string — handles the case where the client injects
          // privacyConsent: true (boolean) and the form config has a question with
          // that same ID typed as radio/text/select.
          const strBase = required
            ? z.string().trim().min(1).max(4000)
            : z.string().trim().max(4000).optional().or(z.literal(''));
          fieldSchema = z.preprocess((v) => (typeof v === 'boolean') ? (v ? 'true' : 'false') : v, strBase);
          break;
        }
      }

      shape[question.id] = fieldSchema;
    }
  }

  return { schema: z.object(shape).passthrough(), allQuestions };
}

/**
 * Extract standard contact fields from dynamic form submission.
 */
function extractContactFields(data: Record<string, unknown>, config: IntakeFormConfig) {
  const name = (data.name as string) ?? '';
  const email = (data.email as string) || null;
  const phone = (data.phone as string) ?? '';

  const noteParts: string[] = [];
  for (const section of config.sections) {
    for (const question of section.questions) {
      if (question.system) continue;
      const val = data[question.id];
      if (val != null && val !== '' && typeof val !== 'boolean') {
        const valStr = Array.isArray(val) ? val.join(', ') : String(val);
        if (valStr) noteParts.push(`${question.label}: ${valStr}`);
      }
    }
  }

  return { name, email, phone, notes: noteParts.length > 0 ? noteParts.join('\n') : null };
}

export async function POST(req: NextRequest) {
  // ── IP-based rate limiting (10 submissions / IP / hour) ──────────────────
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`apply-brokerage:rl:${ip}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Reject oversized payloads before parsing (1MB limit)
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch (error) {
    logger.warn('[apply/brokerage] invalid JSON body', undefined, error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Extract brokerageId and leadType from raw body before validation
  const rawBody = typeof requestBody === 'object' && requestBody !== null
    ? (requestBody as Record<string, unknown>)
    : {};
  const rawBrokerageId = rawBody.brokerageId;
  if (!rawBrokerageId || typeof rawBrokerageId !== 'string') {
    return NextResponse.json({ error: 'Invalid submission data' }, { status: 400 });
  }

  const rawLeadType = rawBody.leadType;
  const resolvedLeadType: 'rental' | 'buyer' =
    rawLeadType === 'buyer' ? 'buyer' : 'rental';

  try {
    // ── Look up the Brokerage ──────────────────────────────────────────────
    const { data: brokerage, error: brokerageError } = await supabase
      .from('Brokerage')
      .select('id, name, ownerId, status, privacyPolicyHtml')
      .eq('id', rawBrokerageId)
      .maybeSingle();
    if (brokerageError) throw brokerageError;
    if (!brokerage || brokerage.status !== 'active') {
      // Return a generic error for both invalid and not-found brokerages
      // to prevent ID enumeration attacks
      logger.warn('[apply/brokerage] invalid or inactive brokerage', { brokerageId: rawBrokerageId });
      return NextResponse.json({ error: 'Unable to process application. Please check the link and try again.' }, { status: 422 });
    }

    // ── Find the brokerage-linked Space owned by the broker owner ──────────
    let space: { id: string; slug: string; name: string; ownerId: string; brokerageId: string | null } | null = null;

    const { data: linkedSpace, error: spaceError } = await supabase
      .from('Space')
      .select('id, slug, name, ownerId, brokerageId')
      .eq('ownerId', brokerage.ownerId)
      .eq('brokerageId', brokerage.id)
      .limit(1)
      .maybeSingle();
    if (spaceError) throw spaceError;
    space = linkedSpace;

    if (!space) {
      const { data: ownerSpaces, error: ownerSpacesError } = await supabase
        .from('Space')
        .select('id, slug, name, ownerId, brokerageId')
        .eq('ownerId', brokerage.ownerId)
        .order('createdAt', { ascending: true })
        .limit(2);
      if (ownerSpacesError) throw ownerSpacesError;
      const fallbackSpace = ownerSpaces?.[0] ?? null;
      if ((ownerSpaces ?? []).length === 1 && fallbackSpace) {
        space = fallbackSpace;
        logger.warn('[apply/brokerage] using legacy owner-only space fallback', {
          brokerageId: brokerage.id,
          ownerId: brokerage.ownerId,
          spaceId: fallbackSpace.id,
        });
      }
    }

    if (!space) {
      logger.error('[apply/brokerage] broker owner has no space', {
        brokerageId: brokerage.id,
        ownerId: brokerage.ownerId,
      });
      return NextResponse.json({ error: 'Brokerage configuration error' }, { status: 500 });
    }

    // ── Fetch the correct form config based on leadType ────────────────────
    let formConfig: IntakeFormConfig | null = null;
    try {
      formConfig = await fetchBrokerageFormConfig(brokerage.id, space.id, resolvedLeadType);
      if (formConfig) {
        formConfig = formConfigSchema.parse(formConfig);
      }
    } catch (err) {
      logger.warn('[apply/brokerage] form config invalid or fetch failed, falling back to legacy', {
        brokerageId: brokerage.id,
        spaceId: space.id,
        leadType: resolvedLeadType,
      }, err);
      formConfig = null;
    }

    // ── Fetch the saved ScoringModel (AI-generated weights/ranges) ─────
    let scoringModel: ScoringModel | null = null;
    if (formConfig) {
      try {
        const scoringColumn = resolvedLeadType === 'buyer'
          ? 'buyerScoringModel'
          : 'rentalScoringModel';
        const { data: scoringSettings } = await supabase
          .from('SpaceSetting')
          .select(scoringColumn)
          .eq('spaceId', space.id)
          .maybeSingle();
        if (scoringSettings) {
          scoringModel = (scoringSettings as Record<string, unknown>)[scoringColumn] as ScoringModel | null;
        }
      } catch (err) {
        logger.warn('[apply/brokerage] scoring model fetch failed (non-fatal, will use legacy scoring)', {
          spaceId: space.id,
          brokerageId: brokerage.id,
          leadType: resolvedLeadType,
        }, err);
      }
    }

    // ── Validate & extract submission data ────────────────────────────────
    let contactName: string;
    let contactEmail: string | null;
    let contactPhone: string;
    let contactNotes: string | null;
    let contactBudget: number | null;
    let contactPreferences: string | null;
    let contactAddress: string | null;
    let contactLeadType: 'rental' | 'buyer' = resolvedLeadType;
    let applicationData: Record<string, unknown>;
    let formConfigSnapshot: IntakeFormConfig | null = null;
    let privacyConsent: boolean | undefined;

    if (formConfig) {
      // ── Dynamic form config path ──────────────────────────────────────
      logger.debug('[apply/brokerage] using dynamic form config', {
        brokerageId: brokerage.id,
        spaceId: space.id,
        leadType: resolvedLeadType,
        version: formConfig.version,
      });
      const { schema: dynamicSchema } = buildDynamicSchemaForSubmission(
        formConfig,
        requestBody as Record<string, unknown>,
      );

      const parsed = dynamicSchema.safeParse(requestBody);
      if (!parsed.success) {
        logger.warn('[apply/brokerage] dynamic validation failed', { issues: parsed.error.issues });
        return NextResponse.json({ error: 'Invalid submission data', issues: parsed.error.issues }, { status: 400 });
      }

      const data = parsed.data as Record<string, unknown>;
      const extracted = extractContactFields(data, formConfig);

      contactName = extracted.name;
      contactEmail = extracted.email;
      contactPhone = extracted.phone;
      contactNotes = extracted.notes;
      contactBudget = parseBudgetToNumber(data.monthlyRent ?? data.buyerBudget ?? data.monthlyGrossIncome ?? null);
      contactPreferences = typeof data.propertyAddress === 'string' ? data.propertyAddress : null;
      contactAddress = typeof data.currentAddress === 'string' ? data.currentAddress : null;
      privacyConsent = typeof data.privacyConsent === 'boolean' ? data.privacyConsent : undefined;
      formConfigSnapshot = JSON.parse(JSON.stringify(formConfig));

      applicationData = {
        ...data,
        submittedAt: new Date().toISOString(),
        formConfigVersion: formConfig.version,
        leadType: contactLeadType,
        brokerageId: brokerage.id,
        brokerageName: brokerage.name,
      };
    } else {
      // ── Legacy path (backwards compatible) ────────────────────────────
      const parsed = brokerageApplicationSchema.safeParse(requestBody);
      if (!parsed.success) {
        logger.warn('[apply/brokerage] validation failed', { issues: parsed.error.issues });
        return NextResponse.json({ error: 'Invalid submission data' }, { status: 400 });
      }

      const payload = parsed.data;
      contactName = payload.legalName;
      contactEmail = payload.email ?? null;
      contactPhone = payload.phone ?? '';
      contactBudget = parseBudgetToNumber(
        resolvedLeadType === 'buyer'
          ? (payload.buyerBudget ?? payload.monthlyGrossIncome ?? null)
          : (payload.monthlyRent ?? payload.monthlyGrossIncome ?? null),
      );
      contactPreferences = payload.propertyAddress ?? null;
      contactAddress = payload.currentAddress ?? null;
      privacyConsent = payload.privacyConsent;

      const noteParts: string[] = [];
      if (payload.targetMoveInDate) noteParts.push(`Timeline: ${payload.targetMoveInDate}`);
      if (payload.propertyAddress) noteParts.push(`Property: ${payload.propertyAddress}`);
      if (payload.employmentStatus) noteParts.push(`Employment: ${payload.employmentStatus}`);
      if (payload.monthlyGrossIncome != null) noteParts.push(`Income: $${payload.monthlyGrossIncome}/mo`);
      if (payload.additionalNotes) noteParts.push(payload.additionalNotes);
      contactNotes = noteParts.length > 0 ? noteParts.join('\n') : null;

      const legacyAppData = buildApplicationData({
        ...payload,
        slug: `brokerage:${payload.brokerageId}`,
      });
      applicationData = {
        ...legacyAppData,
        brokerageId: brokerage.id,
        brokerageName: brokerage.name,
      };
    }

    const fingerprint = applicationFingerprintKey({
      legalName: contactName,
      phone: contactPhone,
      email: contactEmail,
      slug: `brokerage:${brokerage.id}`,
    });
    const idempotencyKey = `apply-brokerage:idempotency:${fingerprint}`;

    // ── Idempotency lock ───────────────────────────────────────────────────
    let idempotencyLockAcquired = false;
    try {
      const lockResult = await redis.set(idempotencyKey, '1', { nx: true, ex: 120 });
      idempotencyLockAcquired = lockResult === 'OK';
    } catch (error) {
      logger.warn('[apply/brokerage] idempotency lock unavailable; using DB fallback', {
        spaceId: space.id,
      }, error);
    }

    // ── Duplicate detection (5-minute window) ──────────────────────────────
    const duplicateCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingRecentLeads, error: dupError } = await supabase
      .from('Contact')
      .select('id, phone, email, scoringStatus, leadScore, scoreLabel, scoreSummary, scoreDetails, applicationRef')
      .eq('spaceId', space.id)
      .eq('name', contactName)
      .contains('tags', ['brokerage-lead'])
      .gte('createdAt', duplicateCutoff)
      .order('createdAt', { ascending: false })
      .limit(5);
    if (dupError) throw dupError;

    const applicationRef = crypto.randomBytes(32).toString('hex');
    const statusPortalToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    if (existingRecentLeads?.length) {
      const normalizedPhone = normalizePhone(contactPhone ?? '');
      const normalizedEmail = (contactEmail ?? '').trim().toLowerCase();

      const duplicate = (existingRecentLeads as Contact[]).find((lead) => {
        const phoneMatch =
          normalizePhone(lead.phone ?? '') !== '' &&
          normalizePhone(lead.phone ?? '') === normalizedPhone;
        const emailMatch =
          normalizedEmail !== '' &&
          (lead.email ?? '').trim().toLowerCase() === normalizedEmail;
        return phoneMatch || emailMatch;
      });

      if (duplicate) {
        return NextResponse.json(
          {
            success: true,
            id: duplicate.id,
            applicationRef: duplicate.applicationRef || applicationRef,
          },
          { status: 200 },
        );
      }
    }

    if (!idempotencyLockAcquired) {
      logger.info('[apply/brokerage] proceeding without distributed lock', {
        spaceId: space.id,
        brokerageId: brokerage.id,
        fingerprint,
      });
    }

    // Fetch space settings for consent snapshot + applicant confirmation email
    let spacePrivacyPolicyUrl: string | null = null;
    let spaceBusinessName: string | null = null;
    let intakeConfirmationEmail: string | null = null;
    try {
      const { data: spaceSetting } = await supabase
        .from('SpaceSetting')
        .select('privacyPolicyUrl, businessName, intakeConfirmationEmail')
        .eq('spaceId', space.id)
        .maybeSingle();
      spacePrivacyPolicyUrl = spaceSetting?.privacyPolicyUrl ?? null;
      spaceBusinessName = spaceSetting?.businessName ?? null;
      intakeConfirmationEmail = spaceSetting?.intakeConfirmationEmail ?? null;
    } catch (err) {
      logger.warn('[apply/brokerage] failed to fetch space settings', { spaceId: space.id }, err);
    }

    // ── Lead routing: if auto-assignment is on and an eligible agent ─────
    // exists, insert into their space; otherwise fall back to the broker
    // owner's space (current behaviour). `routeBrokerageLead` never throws
    // — null → owner-space fallback. Pass the validated lead shape so the
    // BP7d rules layer can match on leadType / budget / tags before
    // falling back to round-robin/score.
    const routing = await routeBrokerageLead(brokerage.id, {
      leadType: contactLeadType,
      budget: contactBudget,
      tags: ['brokerage-lead', 'new-lead'],
    });
    const spaceIdForInsert = routing?.agentSpaceId ?? space.id;
    if (routing) {
      logger.info('[apply/brokerage] auto-assigned to agent', {
        brokerageId: brokerage.id,
        agentUserId: routing.agentUserId,
        agentSpaceId: routing.agentSpaceId,
        method: routing.method,
        ruleId: routing.ruleId ?? null,
      });
    }

    // ── Create Contact in the assigned agent's space (or owner fallback) ──
    const contactInsert: Record<string, unknown> = {
      id: crypto.randomUUID(),
      spaceId: spaceIdForInsert,
      brokerageId: brokerage.id,
      name: contactName,
      email: contactEmail,
      phone: contactPhone,
      budget: contactBudget,
      preferences: contactPreferences,
      address: contactAddress,
      notes: contactNotes,
      type: 'QUALIFICATION',
      properties: [],
      leadType: contactLeadType,
      formLeadType: contactLeadType,
      tags: ['brokerage-lead', 'new-lead'],
      scoringStatus: 'pending',
      scoreLabel: 'unscored',
      sourceLabel: 'brokerage-intake',
      applicationData,
      applicationRef,
      statusPortalToken,
      applicationStatus: 'received',
      consentGiven: privacyConsent === true ? true : privacyConsent === false ? false : null,
      consentTimestamp: privacyConsent === true ? new Date().toISOString() : null,
      consentIp: privacyConsent === true ? ip : null,
      consentPrivacyPolicyUrl: privacyConsent === true ? spacePrivacyPolicyUrl : null,
    };

    if (formConfigSnapshot) {
      contactInsert.formConfigSnapshot = formConfigSnapshot;
    }

    const { data: contacts, error: insertError } = await supabase
      .from('Contact')
      .insert(contactInsert)
      .select();
    if (insertError) throw insertError;
    const contact = contacts![0] as Contact;

    logger.info('[apply/brokerage] submission persisted', {
      contactId: contact.id,
      spaceId: spaceIdForInsert,
      ownerSpaceId: space.id,
      brokerageId: brokerage.id,
      dynamicForm: !!formConfigSnapshot,
      leadType: contactLeadType,
      routed: routing !== null,
      routingMethod: routing?.method ?? null,
      routingRuleId: routing?.ruleId ?? null,
      assignedUserId: routing?.agentUserId ?? null,
    });

    // ── Scoring + notification (awaited before response) ──────────────────
    let scoring: LeadScoringResult = {
      scoringStatus: 'failed',
      leadScore: null,
      scoreLabel: 'unscored',
      scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
      scoreDetails: null,
    };

    try {
      // Use dynamic scoring when we have a form config, legacy otherwise
      scoring = await scoreLeadApplicationDynamic({
        contactId: contact.id,
        formConfig: formConfigSnapshot,
        answers: formConfigSnapshot
          ? (applicationData as Record<string, string | string[] | number | boolean>)
          : undefined,
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        budget: contactBudget,
        applicationData: !formConfigSnapshot
          ? (applicationData as Record<string, unknown> & { legalName: string })
          : undefined,
        leadType: contactLeadType,
        scoringModel,
      });

      const { error: scoreUpdateError } = await supabase
        .from('Contact')
        .update({
          scoringStatus: scoring.scoringStatus,
          leadScore: scoring.leadScore,
          scoreLabel: scoring.scoreLabel,
          scoreSummary: scoring.scoreSummary,
          scoreDetails: scoring.scoreDetails,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', contact.id);
      if (scoreUpdateError) {
        logger.error('[apply/brokerage] scoring update failed', {
          contactId: contact.id,
        }, scoreUpdateError);
      } else {
        logger.info('[apply/brokerage] scoring persisted', {
          contactId: contact.id,
          scoringStatus: scoring.scoringStatus,
          scoreLabel: scoring.scoreLabel,
        });
      }
    } catch (error) {
      logger.error('[apply/brokerage] scoring failed', { contactId: contact.id }, error);
      try {
        await supabase
          .from('Contact')
          .update({
            scoringStatus: 'failed',
            leadScore: null,
            scoreLabel: 'unscored',
            scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
            updatedAt: new Date().toISOString(),
          })
          .eq('id', contact.id);
      } catch (fallbackErr) {
        logger.error('[apply/brokerage] fallback scoring state failed', {
          contactId: contact.id,
        }, fallbackErr);
      }
    }

    // Send brokerage dashboard notification + applicant confirmation email in parallel
    const businessName = spaceBusinessName || brokerage.name || space.name;

    const brokerLeadCopy = notificationForNewBrokerageLead(contactName, {
      phone: contactPhone,
      email: contactEmail,
    });
    const brokerNotification = notifyBroker({
      brokerageId: brokerage.id,
      type: 'lead_hot',
      title: brokerLeadCopy.title,
      body: brokerLeadCopy.description,
      metadata: {
        contactId: contact.id,
        leadScore: scoring.leadScore,
        scoreLabel: scoring.scoreLabel,
        source: 'brokerage-intake',
      },
    }).catch((err) => {
      logger.error('[apply/brokerage] brokerage notification failed', { contactId: contact.id }, err);
    });

    const applicantConfirmation = contactEmail
      ? sendApplicationConfirmation({
          toEmail: contactEmail,
          applicantName: contactName,
          businessName,
          slug: `brokerage:${brokerage.id}`,
          applicationRef,
          leadType: contactLeadType,
          customMessage: intakeConfirmationEmail,
        }).catch((confirmErr) => {
          logger.error('[apply/brokerage] applicant confirmation email failed', { contactId: contact.id }, confirmErr);
        })
      : Promise.resolve();

    await Promise.all([brokerNotification, applicantConfirmation]);
    logger.debug('[apply/brokerage] notifications dispatched', { contactId: contact.id });

    return NextResponse.json(
      {
        success: true,
        id: contact.id,
        applicationRef,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error('[apply/brokerage] unhandled submission failure', {
      brokerageId: rawBrokerageId,
    }, error);
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
