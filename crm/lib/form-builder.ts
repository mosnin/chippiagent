import { supabase } from '@/lib/supabase';
import { formConfigSchema } from '@/lib/form-config-schema';
import type {
  IntakeFormConfig,
  FormQuestion,
} from '@/lib/types';

// ── Stable IDs for system fields ──
// These IDs MUST match the Zod schema superRefine check in form-config-schema.ts
// which validates that system fields with ids 'name', 'email', 'phone' are present.
const SYSTEM_NAME_ID = 'name';
const SYSTEM_EMAIL_ID = 'email';
const SYSTEM_PHONE_ID = 'phone';

// ── System field generator ──

/** Returns the three required system fields (name, email, phone) with system: true */
export function generateSystemFields(): FormQuestion[] {
  return [
    {
      id: SYSTEM_NAME_ID,
      type: 'text',
      label: 'What should I call you?',
      placeholder: 'Alex Johnson',
      required: true,
      position: 0,
      system: true,
      validation: { minLength: 1, maxLength: 120 },
    },
    {
      id: SYSTEM_EMAIL_ID,
      type: 'email',
      label: "What's the best email to reach you?",
      placeholder: 'alex@email.com',
      required: true,
      position: 1,
      system: true,
      validation: { maxLength: 255 },
    },
    {
      id: SYSTEM_PHONE_ID,
      type: 'phone',
      label: 'And a phone number?',
      placeholder: '(555) 123-4567',
      required: true,
      position: 2,
      system: true,
      validation: { maxLength: 40 },
    },
  ];
}

// ── Default Rental Form Config ──
// The 10-question rental intake used when a realtor hasn't customized
// their form. Also the fallback IntakeChat uses on the brokerage variant
// when no brokerage-level config exists.
// Step 1: Getting Started  |  Step 2: Basics  |  Step 3: Move Timing  |  Step 4: Location
// Step 5: Budget  |  Step 6: Income  |  Step 7: Employment  |  Step 8: Household
// Step 9: Additional Info  |  Step 10: Ready?

export const DEFAULT_RENTAL_FORM_CONFIG: IntakeFormConfig = {
  version: 1,
  leadType: 'rental',
  sections: [
    // ── Section 0 (Step 1): Basics ──
    {
      id: '10000000-0000-4000-a000-000000000001',
      title: "Let's start with the basics",
      description: 'We just need a few details to get going.',
      position: 0,
      questions: generateSystemFields(),
    },
    // ── Section 1 (Step 2): Move Timing ──
    {
      id: '10000000-0000-4000-a000-000000000002',
      title: 'When are you planning to move?',
      position: 1,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000001',
          type: 'radio',
          label: 'When are you hoping to move?',
          required: true,
          position: 0,
          options: [
            { value: 'asap', label: 'ASAP — within 2 weeks', scoreValue: 10 },
            { value: '30days', label: 'Within 30 days', scoreValue: 8 },
            { value: '1-2months', label: '1 to 2 months', scoreValue: 5 },
            { value: 'browsing', label: 'Just browsing for now', scoreValue: 2 },
          ],
          scoring: {
            weight: 8,
            mappings: [
              { value: 'asap', points: 10 },
              { value: '30days', points: 8 },
              { value: '1-2months', points: 5 },
              { value: 'browsing', points: 2 },
            ],
          },
        },
      ],
    },
    // ── Section 2 (Step 3): Location ──
    {
      id: '10000000-0000-4000-a000-000000000003',
      title: 'Where are you looking to live?',
      position: 2,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000002',
          type: 'text',
          label: 'Which area are you focused on?',
          description: 'Neighborhood, city, or general area — whatever you have in mind.',
          placeholder: 'e.g., Downtown Miami, Brickell',
          required: true,
          position: 0,
          scoring: { weight: 0 },
        },
      ],
    },
    // ── Section 3 (Step 4): Budget ──
    {
      id: '10000000-0000-4000-a000-000000000004',
      title: "What's your monthly rent budget?",
      position: 3,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000003',
          type: 'number',
          label: "What's your monthly rent budget?",
          placeholder: 'e.g., 2500',
          required: true,
          position: 0,
          scoring: { weight: 6 },
          validation: { min: 0 },
        },
      ],
    },
    // ── Section 4 (Step 5): Income ──
    {
      id: '10000000-0000-4000-a000-000000000005',
      title: "What's your estimated monthly income?",
      position: 4,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000004',
          type: 'number',
          label: 'Roughly what do you take home each month?',
          description: 'A ballpark is fine — landlords usually want to see ~3x the rent.',
          placeholder: 'e.g., 5000',
          required: true,
          position: 0,
          scoring: { weight: 7 },
          validation: { min: 0 },
        },
      ],
    },
    // ── Section 5 (Step 6): Employment ──
    {
      id: '10000000-0000-4000-a000-000000000006',
      title: "What's your current work situation?",
      position: 5,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000005',
          type: 'radio',
          label: 'How are you employed right now?',
          required: true,
          position: 0,
          options: [
            { value: 'full-time', label: 'Full-time' },
            { value: 'self-employed', label: 'Self-employed' },
            { value: 'part-time', label: 'Part-time' },
            { value: 'student', label: 'Student' },
            { value: 'not-employed', label: 'Between jobs' },
          ],
          scoring: {
            weight: 5,
            mappings: [
              { value: 'full-time', points: 10 },
              { value: 'self-employed', points: 8 },
              { value: 'part-time', points: 5 },
              { value: 'student', points: 4 },
              { value: 'not-employed', points: 2 },
            ],
          },
        },
      ],
    },
    // ── Section 6 (Step 7): Household ──
    {
      id: '10000000-0000-4000-a000-000000000007',
      title: 'Tell us about your household',
      position: 6,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000006',
          type: 'number',
          label: 'How many people will be living there?',
          placeholder: 'e.g., 2',
          required: true,
          position: 0,
          validation: { min: 1 },
          scoring: { weight: 0 },
        },
        {
          id: '10000000-0000-4000-b000-000000000007',
          type: 'radio',
          label: 'Any pets coming with you?',
          required: false,
          position: 1,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
          scoring: { weight: 0 },
        },
      ],
    },
    // ── Section 7 (Step 8): Additional Info ──
    {
      id: '10000000-0000-4000-a000-000000000008',
      title: 'Anything we should know?',
      description: 'This step is optional. Share anything that might help.',
      position: 7,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000008',
          type: 'textarea',
          label: 'Anything else I should know?',
          description: 'Totally optional — but if there are deal-breakers or preferences, here works.',
          placeholder: 'Special requirements, preferences, questions...',
          required: false,
          position: 0,
          validation: { maxLength: 4000 },
          scoring: { weight: 0 },
        },
      ],
    },
    // ── Section 8 (Step 9): Ready? ──
    {
      id: '10000000-0000-4000-a000-000000000009',
      title: 'If you find the right place, are you ready to move forward?',
      position: 8,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000009',
          type: 'radio',
          label: 'If we find the right place, are you ready to sign?',
          required: true,
          position: 0,
          options: [
            { value: 'ready', label: 'Yes, ready now', scoreValue: 10 },
            { value: 'maybe', label: 'Maybe — depends on the place', scoreValue: 5 },
            { value: 'exploring', label: 'Still just exploring', scoreValue: 2 },
          ],
          scoring: {
            weight: 9,
            mappings: [
              { value: 'ready', points: 10 },
              { value: 'maybe', points: 5 },
              { value: 'exploring', points: 2 },
            ],
          },
        },
      ],
    },
  ],
};

// ── Default Buyer Form Config ──
// The 9-question buyer intake used when a realtor hasn't customized
// their form. Also the fallback IntakeChat uses on the brokerage variant
// when no brokerage-level config exists.
// Step 1: Getting Started  |  Step 2: Basics  |  Step 3: Budget
// Step 4: Pre-Approval  |  Step 5: Property Type  |  Step 6: Must-Haves
// Step 7: Timeline  |  Step 8: About You  |  Step 9: Ready?

export const DEFAULT_BUYER_FORM_CONFIG: IntakeFormConfig = {
  version: 1,
  leadType: 'buyer',
  sections: [
    // ── Section 0 (Step 1): Basics ──
    {
      id: '20000000-0000-4000-a000-000000000001',
      title: "Let's start with the basics",
      description: 'We just need a few details to get going.',
      position: 0,
      questions: generateSystemFields(),
    },
    // ── Section 1 (Step 2): Budget ──
    {
      id: '20000000-0000-4000-a000-000000000002',
      title: "What's your budget?",
      position: 1,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000001',
          type: 'number',
          label: "What's your purchase budget?",
          description: 'A ceiling number is fine — we can refine later.',
          placeholder: 'e.g., 450000',
          required: true,
          position: 0,
          scoring: { weight: 6 },
          validation: { min: 0 },
        },
      ],
    },
    // ── Section 2 (Step 3): Pre-Approval ──
    {
      id: '20000000-0000-4000-a000-000000000003',
      title: 'Are you pre-approved for a mortgage?',
      position: 2,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000002',
          type: 'radio',
          label: 'Where are you with mortgage pre-approval?',
          required: false,
          position: 0,
          options: [
            { value: 'yes', label: 'Already pre-approved', scoreValue: 10 },
            { value: 'not-yet', label: 'Working on it', scoreValue: 5 },
            { value: 'no', label: "Haven't started yet", scoreValue: 3 },
          ],
          scoring: {
            weight: 8,
            mappings: [
              { value: 'yes', points: 10 },
              { value: 'no', points: 3 },
              { value: 'not-yet', points: 5 },
            ],
          },
        },
        {
          id: '20000000-0000-4000-b000-000000000003',
          type: 'text',
          label: 'Who are you working with on the loan?',
          placeholder: 'e.g., Chase, Wells Fargo',
          required: false,
          position: 1,
          visibleWhen: {
            questionId: '20000000-0000-4000-b000-000000000002',
            operator: 'equals',
            value: 'yes',
          },
          scoring: { weight: 0 },
        },
        {
          id: '20000000-0000-4000-b000-000000000004',
          type: 'text',
          label: "What's the pre-approval amount?",
          placeholder: 'e.g., $400,000',
          required: false,
          position: 2,
          visibleWhen: {
            questionId: '20000000-0000-4000-b000-000000000002',
            operator: 'equals',
            value: 'yes',
          },
          scoring: { weight: 0 },
        },
      ],
    },
    // ── Section 3 (Step 4): Property Type ──
    {
      id: '20000000-0000-4000-a000-000000000004',
      title: 'What type of property are you looking for?',
      position: 3,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000005',
          type: 'radio',
          label: 'What kind of place are you picturing?',
          required: true,
          position: 0,
          options: [
            { value: 'single-family', label: 'Single family home' },
            { value: 'condo', label: 'Condo or apartment' },
            { value: 'townhouse', label: 'Townhouse' },
            { value: 'multi-family', label: 'Multi-family' },
          ],
          scoring: { weight: 0 },
        },
        {
          id: '20000000-0000-4000-b000-000000000006',
          type: 'radio',
          label: 'How many bedrooms do you need?',
          required: false,
          position: 1,
          options: [
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5+', label: '5 or more' },
          ],
          scoring: { weight: 0 },
        },
        {
          id: '20000000-0000-4000-b000-000000000007',
          type: 'radio',
          label: 'And bathrooms?',
          required: false,
          position: 2,
          options: [
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3+', label: '3 or more' },
          ],
          scoring: { weight: 0 },
        },
      ],
    },
    // ── Section 4 (Step 5): Must-Haves ──
    {
      id: '20000000-0000-4000-a000-000000000005',
      title: 'Any must-haves?',
      description: 'Select all that apply.',
      position: 4,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000008',
          type: 'multi_select',
          label: 'Which of these are non-negotiable?',
          description: 'Pick anything that would make or break the deal.',
          required: false,
          position: 0,
          options: [
            { value: 'garage', label: 'Garage' },
            { value: 'yard', label: 'Yard' },
            { value: 'pool', label: 'Pool' },
            { value: 'updated-kitchen', label: 'Updated kitchen' },
            { value: 'home-office', label: 'Home office' },
            { value: 'storage', label: 'Storage' },
            { value: 'washer-dryer', label: 'Washer/dryer' },
            { value: 'accessibility', label: 'Accessibility features' },
          ],
          scoring: { weight: 0 },
        },
      ],
    },
    // ── Section 5 (Step 6): Timeline ──
    {
      id: '20000000-0000-4000-a000-000000000006',
      title: 'When do you want to close?',
      position: 5,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000009',
          type: 'radio',
          label: 'When would you like to close?',
          required: true,
          position: 0,
          options: [
            { value: 'asap', label: 'ASAP — within 30 days', scoreValue: 10 },
            { value: '1-3months', label: '1 to 3 months', scoreValue: 7 },
            { value: '3-6months', label: '3 to 6 months', scoreValue: 4 },
            { value: 'exploring', label: 'No rush — still exploring', scoreValue: 2 },
          ],
          scoring: {
            weight: 8,
            mappings: [
              { value: 'asap', points: 10 },
              { value: '1-3months', points: 7 },
              { value: '3-6months', points: 4 },
              { value: 'exploring', points: 2 },
            ],
          },
        },
      ],
    },
    // ── Section 6 (Step 7): About You ──
    {
      id: '20000000-0000-4000-a000-000000000007',
      title: 'Tell us about you',
      position: 6,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000010',
          type: 'radio',
          label: 'Where are you living right now?',
          required: false,
          position: 0,
          options: [
            { value: 'renting', label: 'Renting' },
            { value: 'own', label: 'Own a home' },
            { value: 'family', label: 'With family' },
            { value: 'other', label: 'Something else' },
          ],
          scoring: { weight: 0 },
        },
        {
          id: '20000000-0000-4000-b000-000000000011',
          type: 'radio',
          label: 'Is this your first time buying?',
          required: false,
          position: 1,
          options: [
            { value: 'yes', label: 'Yes, first time' },
            { value: 'no', label: "No, I've done this before" },
          ],
          scoring: { weight: 0 },
        },
      ],
    },
    // ── Section 7 (Step 8): Ready? ──
    {
      id: '20000000-0000-4000-a000-000000000008',
      title: 'If you find the right place, are you ready to move forward?',
      position: 7,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000012',
          type: 'radio',
          label: 'If we find the right place, are you ready to make an offer?',
          required: true,
          position: 0,
          options: [
            { value: 'ready', label: 'Yes, ready now', scoreValue: 10 },
            { value: 'maybe', label: 'Maybe — depends on the place', scoreValue: 5 },
            { value: 'exploring', label: 'Still just exploring', scoreValue: 2 },
          ],
          scoring: {
            weight: 9,
            mappings: [
              { value: 'ready', points: 10 },
              { value: 'maybe', points: 5 },
              { value: 'exploring', points: 2 },
            ],
          },
        },
      ],
    },
  ],
};

// ── Validation (delegates to the canonical Zod schema in form-config-schema.ts) ──

export { formConfigSchema };

/** Validate an unknown value as a valid IntakeFormConfig */
export function validateFormConfig(config: unknown) {
  return formConfigSchema.safeParse(config);
}

// ── Form config fetching with fallback chain ──

/**
 * Fetches the form config for a given space, with the following fallback chain:
 * 1. If SpaceSetting.formConfig is set and formConfigSource is 'custom', use it
 * 2. If formConfigSource is 'brokerage', fetch from the linked Brokerage.brokerageFormConfig
 * 3. Otherwise (formConfigSource is 'legacy' or formConfig is null), return null (legacy mode)
 */
export async function getFormConfig(
  spaceId: string
): Promise<IntakeFormConfig | null> {
  // Fetch the space setting with its form config
  const { data: setting, error: settingError } = await supabase
    .from('SpaceSetting')
    .select('"formConfig", "formConfigSource"')
    .eq('spaceId', spaceId)
    .single();

  if (settingError || !setting) {
    return null; // legacy mode
  }

  const source = setting.formConfigSource as string;

  // Custom form: use the space-level config directly
  if (source === 'custom' && setting.formConfig) {
    const result = formConfigSchema.safeParse(setting.formConfig);
    return result.success ? result.data : null;
  }

  // Brokerage-inherited form: fetch from the linked brokerage
  if (source === 'brokerage') {
    const { data: space } = await supabase
      .from('Space')
      .select('"brokerageId"')
      .eq('id', spaceId)
      .single();

    if (space?.brokerageId) {
      const { data: brokerage } = await supabase
        .from('Brokerage')
        .select('"brokerageFormConfig"')
        .eq('id', space.brokerageId)
        .single();

      if (brokerage?.brokerageFormConfig) {
        const result = formConfigSchema.safeParse(
          brokerage.brokerageFormConfig
        );
        return result.success ? result.data : null;
      }
    }

    // Brokerage config missing: fall back to legacy
    return null;
  }

  // Legacy mode (explicit or implicit)
  return null;
}

// ── Dual form config fetching (rental + buyer) ──

export type DualFormConfigs = {
  rental: IntakeFormConfig | null;
  buyer: IntakeFormConfig | null;
  source: 'custom' | 'brokerage' | 'legacy';
};

/** Safely parse a raw JSON value as IntakeFormConfig, returning null on failure. */
function safeParseConfig(raw: unknown): IntakeFormConfig | null {
  if (!raw) return null;
  const result = formConfigSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Fetches BOTH rental and buyer form configs for a space.
 *
 * Fallback chain per lead type:
 *   1. SpaceSetting.[rental|buyer]FormConfig (dual config columns)
 *   2. SpaceSetting.formConfig (legacy single column, treated as rental or buyer based on its leadType)
 *   3. Brokerage.[brokerage[Rental|Buyer]FormConfig] (if formConfigSource === 'brokerage')
 *   4. Brokerage.brokerageFormConfig (legacy single brokerage column)
 *   5. null (caller should use DEFAULT_*_FORM_CONFIG or legacy scoring)
 */
export async function getFormConfigs(
  spaceId: string,
  brokerageId?: string | null,
): Promise<DualFormConfigs> {
  const { data: setting, error: settingError } = await supabase
    .from('SpaceSetting')
    .select('"formConfig", "formConfigSource", "rentalFormConfig", "buyerFormConfig"')
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (settingError || !setting) {
    return { rental: null, buyer: null, source: 'legacy' };
  }

  const source = (setting.formConfigSource as string) || 'legacy';

  if (source === 'custom') {
    let rentalConfig = safeParseConfig(setting.rentalFormConfig);
    let buyerConfig = safeParseConfig(setting.buyerFormConfig);

    // Legacy compatibility: if no dual configs exist but single formConfig does,
    // route it to the correct lead type based on its leadType field
    if (!rentalConfig && !buyerConfig && setting.formConfig) {
      const legacySingle = safeParseConfig(setting.formConfig);
      if (legacySingle) {
        if (legacySingle.leadType === 'buyer') {
          buyerConfig = legacySingle;
        } else {
          // 'rental' or 'general' → treat as rental
          rentalConfig = legacySingle;
        }
      }
    }

    return { rental: rentalConfig, buyer: buyerConfig, source: 'custom' };
  }

  if (source === 'brokerage') {
    // Resolve brokerageId if not provided
    let resolvedBrokerageId = brokerageId;
    if (!resolvedBrokerageId) {
      const { data: space } = await supabase
        .from('Space')
        .select('"brokerageId"')
        .eq('id', spaceId)
        .maybeSingle();
      resolvedBrokerageId = space?.brokerageId ?? null;
    }

    if (resolvedBrokerageId) {
      const { data: brokerage } = await supabase
        .from('Brokerage')
        .select('"brokerageFormConfig", "brokerageRentalFormConfig", "brokerageBuyerFormConfig"')
        .eq('id', resolvedBrokerageId)
        .maybeSingle();

      if (brokerage) {
        let rentalConfig = safeParseConfig(brokerage.brokerageRentalFormConfig);
        let buyerConfig = safeParseConfig(brokerage.brokerageBuyerFormConfig);

        // Legacy compatibility: single brokerageFormConfig
        if (!rentalConfig && !buyerConfig && brokerage.brokerageFormConfig) {
          const legacySingle = safeParseConfig(brokerage.brokerageFormConfig);
          if (legacySingle) {
            if (legacySingle.leadType === 'buyer') {
              buyerConfig = legacySingle;
            } else {
              rentalConfig = legacySingle;
            }
          }
        }

        return { rental: rentalConfig, buyer: buyerConfig, source: 'brokerage' };
      }
    }

    return { rental: null, buyer: null, source: 'brokerage' };
  }

  // Legacy mode
  return { rental: null, buyer: null, source: 'legacy' };
}

/**
 * Resolves the correct form config for a specific lead type using the full fallback chain:
 *   1. Custom or brokerage config for the specific lead type
 *   2. Default template for the lead type
 *
 * Returns { config, isCustom } so callers know whether to use dynamic scoring
 * (custom config with user-defined weights) vs default/legacy scoring.
 */
export async function getFormConfigForLeadType(
  spaceId: string,
  leadType: 'rental' | 'buyer',
  brokerageId?: string | null,
): Promise<{ config: IntakeFormConfig; isCustom: boolean }> {
  const dual = await getFormConfigs(spaceId, brokerageId);

  const customConfig = leadType === 'buyer'
    ? dual.buyer
    : dual.rental;

  if (customConfig) {
    return { config: customConfig, isCustom: true };
  }

  // Fall back to default template (still usable for dynamic scoring, but
  // the caller may choose to use legacy scoring if they prefer)
  return { config: getDefaultFormConfig(leadType), isCustom: false };
}

/**
 * Returns the appropriate default form config for a given lead type.
 * Used as fallback when getFormConfig returns null (legacy mode).
 */
export function getDefaultFormConfig(
  leadType: 'rental' | 'buyer'
): IntakeFormConfig {
  return leadType === 'buyer'
    ? DEFAULT_BUYER_FORM_CONFIG
    : DEFAULT_RENTAL_FORM_CONFIG;
}

// ── Snapshot for submissions ──

/**
 * Creates a deep-frozen copy of a form config for storing with submissions.
 * This ensures the form structure at the time of submission is preserved
 * even if the form is later modified.
 */
export function snapshotFormConfig(config: IntakeFormConfig): IntakeFormConfig {
  // Deep clone via structured clone (available in Node 17+ / all modern browsers)
  const snapshot: IntakeFormConfig = JSON.parse(JSON.stringify(config));
  return Object.freeze(snapshot) as IntakeFormConfig;
}
