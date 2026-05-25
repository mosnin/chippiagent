import type { IntakeFormConfig } from './types';

// Use deterministic IDs for template sections/questions so that JSON.stringify
// comparisons (used for change detection in the form builder pages) produce
// stable results across server restarts, SSR hydration, and hot-reloads.
// crypto.randomUUID() would generate new IDs every time the module is
// evaluated, causing false "unsaved changes" indicators.
let _idCounter = 0;
function id() {
  _idCounter += 1;
  return `tmpl-${_idCounter.toString(36).padStart(6, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENTAL TEMPLATE — standalone rental form (no Getting Started section)
// The Getting Started step is handled by the intake form automatically.
// ─────────────────────────────────────────────────────────────────────────────

export const RENTAL_TEMPLATE: IntakeFormConfig = {
  version: 1,
  leadType: 'rental',
  sections: [
    // ── 1. Basics ──
    {
      id: id(),
      title: 'Basics',
      description: 'We just need a few details to get going.',
      position: 0,
      questions: [
        {
          id: 'firstName',
          type: 'text',
          label: 'First name',
          placeholder: 'Alex',
          required: true,
          position: 0,
          system: true,
        },
        {
          id: 'lastName',
          type: 'text',
          label: 'Last name',
          placeholder: 'Johnson',
          required: true,
          position: 1,
          system: true,
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email',
          placeholder: 'alex@email.com',
          required: true,
          position: 2,
          system: true,
        },
        {
          id: 'phone',
          type: 'phone',
          label: 'Phone',
          placeholder: '(555) 123-4567',
          required: true,
          position: 3,
          system: true,
        },
      ],
    },

    // ── 2. Move Timing ──
    {
      id: id(),
      title: 'Move Timing',
      position: 1,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'When are you planning to move?',
          required: true,
          position: 0,
          scoring: {
            weight: 8,
            mappings: [
              { value: 'asap', points: 10 },
              { value: '30days', points: 7 },
              { value: '1-2months', points: 4 },
              { value: 'browsing', points: 1 },
            ],
          },
          options: [
            { value: 'asap', label: 'ASAP (within 2 weeks)' },
            { value: '30days', label: 'Within 30 days' },
            { value: '1-2months', label: '1-2 months' },
            { value: 'browsing', label: 'Just browsing' },
          ],
        },
      ],
    },

    // ── 3. Location ──
    {
      id: id(),
      title: 'Location',
      position: 2,
      questions: [
        {
          id: id(),
          type: 'text',
          label: 'Where are you looking to live?',
          placeholder: 'e.g., Downtown Miami, Brickell',
          required: true,
          position: 0,
        },
      ],
    },

    // ── 4. Budget ──
    {
      id: id(),
      title: 'Budget',
      position: 3,
      questions: [
        {
          id: id(),
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

    // ── 5. Income ──
    {
      id: id(),
      title: 'Income',
      position: 4,
      questions: [
        {
          id: id(),
          type: 'number',
          label: "What's your estimated monthly income?",
          placeholder: 'e.g., 5000',
          required: true,
          position: 0,
          scoring: { weight: 7 },
          validation: { min: 0 },
        },
      ],
    },

    // ── 6. Employment ──
    {
      id: id(),
      title: 'Employment',
      position: 5,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: "What's your current work situation?",
          required: true,
          position: 0,
          scoring: {
            weight: 5,
            mappings: [
              { value: 'full-time', points: 10 },
              { value: 'self-employed', points: 8 },
              { value: 'part-time', points: 5 },
              { value: 'student', points: 3 },
              { value: 'not-employed', points: 1 },
            ],
          },
          options: [
            { value: 'full-time', label: 'Full-time employed' },
            { value: 'self-employed', label: 'Self-employed' },
            { value: 'part-time', label: 'Part-time employed' },
            { value: 'student', label: 'Student' },
            { value: 'not-employed', label: 'Not currently employed' },
          ],
        },
      ],
    },

    // ── 7. Household ──
    {
      id: id(),
      title: 'Household',
      position: 6,
      questions: [
        {
          id: id(),
          type: 'number',
          label: 'How many people will be living in the home?',
          placeholder: 'e.g., 2',
          required: true,
          position: 0,
          validation: { min: 1 },
        },
        {
          id: id(),
          type: 'radio',
          label: 'Do you have pets?',
          required: false,
          position: 1,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        },
      ],
    },

    // ── 8. Additional Info ──
    {
      id: id(),
      title: 'Additional Info',
      description: 'This step is optional. Share anything that might help.',
      position: 7,
      questions: [
        {
          id: id(),
          type: 'textarea',
          label: 'Anything we should know?',
          placeholder: 'Special requirements, preferences, questions...',
          required: false,
          position: 0,
        },
      ],
    },

    // ── 9. Ready? ──
    {
      id: id(),
      title: 'Ready?',
      position: 8,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'If you find the right place, are you ready to move forward?',
          required: true,
          position: 0,
          scoring: {
            weight: 9,
            mappings: [
              { value: 'ready', points: 10 },
              { value: 'maybe', points: 5 },
              { value: 'exploring', points: 2 },
            ],
          },
          options: [
            { value: 'ready', label: 'Yes, ready now', scoreValue: 10 },
            { value: 'maybe', label: 'Maybe', scoreValue: 5 },
            { value: 'exploring', label: 'Just exploring', scoreValue: 2 },
          ],
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// BUYER TEMPLATE — standalone buyer form (no Getting Started section)
// The Getting Started step is handled by the intake form automatically.
// ─────────────────────────────────────────────────────────────────────────────

export const BUYER_TEMPLATE: IntakeFormConfig = {
  version: 1,
  leadType: 'buyer',
  sections: [
    // ── 1. Basics ──
    {
      id: id(),
      title: 'Basics',
      description: 'We just need a few details to get going.',
      position: 0,
      questions: [
        {
          id: 'firstName',
          type: 'text',
          label: 'First name',
          placeholder: 'Alex',
          required: true,
          position: 0,
          system: true,
        },
        {
          id: 'lastName',
          type: 'text',
          label: 'Last name',
          placeholder: 'Johnson',
          required: true,
          position: 1,
          system: true,
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email',
          placeholder: 'alex@email.com',
          required: true,
          position: 2,
          system: true,
        },
        {
          id: 'phone',
          type: 'phone',
          label: 'Phone',
          placeholder: '(555) 123-4567',
          required: true,
          position: 3,
          system: true,
        },
      ],
    },

    // ── 2. Budget ──
    {
      id: id(),
      title: 'Budget',
      position: 1,
      questions: [
        {
          id: id(),
          type: 'number',
          label: "What's your purchase budget?",
          placeholder: 'e.g., 450000',
          required: true,
          position: 0,
          scoring: { weight: 6 },
          validation: { min: 0 },
        },
      ],
    },

    // ── 3. Pre-Approval ──
    {
      id: id(),
      title: 'Pre-Approval',
      position: 2,
      questions: [
        {
          id: 'preApproval',
          type: 'radio',
          label: 'Are you pre-approved for a mortgage?',
          required: false,
          position: 0,
          scoring: {
            weight: 8,
            mappings: [
              { value: 'yes', points: 10 },
              { value: 'not-yet', points: 4 },
              { value: 'no', points: 2 },
            ],
          },
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'not-yet', label: 'Not yet' },
          ],
        },
        {
          id: id(),
          type: 'text',
          label: 'Lender name',
          placeholder: 'e.g., Chase, Wells Fargo',
          required: false,
          position: 1,
          visibleWhen: { questionId: 'preApproval', operator: 'equals', value: 'yes' },
        },
        {
          id: id(),
          type: 'text',
          label: 'Pre-approval amount',
          placeholder: 'e.g., $400,000',
          required: false,
          position: 2,
          visibleWhen: { questionId: 'preApproval', operator: 'equals', value: 'yes' },
        },
      ],
    },

    // ── 4. Property ──
    {
      id: id(),
      title: 'Property',
      position: 3,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'What type of property are you looking for?',
          required: true,
          position: 0,
          options: [
            { value: 'single-family', label: 'Single Family' },
            { value: 'condo', label: 'Condo / Apartment' },
            { value: 'townhouse', label: 'Townhouse' },
            { value: 'multi-family', label: 'Multi-Family' },
          ],
        },
        {
          id: id(),
          type: 'radio',
          label: 'Bedrooms needed',
          required: false,
          position: 1,
          options: [
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5+', label: '5+' },
          ],
        },
        {
          id: id(),
          type: 'radio',
          label: 'Bathrooms needed',
          required: false,
          position: 2,
          options: [
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3+', label: '3+' },
          ],
        },
      ],
    },

    // ── 5. Must-Haves ──
    {
      id: id(),
      title: 'Must-Haves',
      description: 'Select all that apply.',
      position: 4,
      questions: [
        {
          id: id(),
          type: 'multi_select',
          label: 'Any must-haves?',
          required: false,
          position: 0,
          options: [
            { value: 'garage', label: 'Garage' },
            { value: 'yard', label: 'Yard' },
            { value: 'pool', label: 'Pool' },
            { value: 'updated_kitchen', label: 'Updated Kitchen' },
            { value: 'home_office', label: 'Home Office' },
            { value: 'storage', label: 'Storage' },
            { value: 'washer_dryer', label: 'Washer/Dryer' },
            { value: 'accessibility', label: 'Accessibility Features' },
          ],
        },
      ],
    },

    // ── 6. Timeline ──
    {
      id: id(),
      title: 'Timeline',
      position: 5,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'When do you want to close?',
          required: true,
          position: 0,
          scoring: {
            weight: 8,
            mappings: [
              { value: 'asap', points: 10 },
              { value: '1-3months', points: 7 },
              { value: '3-6months', points: 4 },
              { value: 'exploring', points: 1 },
            ],
          },
          options: [
            { value: 'asap', label: 'ASAP (within 30 days)' },
            { value: '1-3months', label: '1-3 months' },
            { value: '3-6months', label: '3-6 months' },
            { value: 'exploring', label: 'Just exploring' },
          ],
        },
      ],
    },

    // ── 7. About You ──
    {
      id: id(),
      title: 'About You',
      position: 6,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'Current housing situation',
          required: false,
          position: 0,
          options: [
            { value: 'renting', label: 'Currently renting' },
            { value: 'own', label: 'Own a home' },
            { value: 'family', label: 'Living with family' },
            { value: 'other', label: 'Other' },
          ],
        },
        {
          id: id(),
          type: 'radio',
          label: 'First-time buyer?',
          required: false,
          position: 1,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        },
      ],
    },

    // ── 8. Ready? ──
    {
      id: id(),
      title: 'Ready?',
      position: 7,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'If you find the right place, are you ready to move forward?',
          required: true,
          position: 0,
          scoring: {
            weight: 9,
            mappings: [
              { value: 'ready', points: 10 },
              { value: 'maybe', points: 5 },
              { value: 'exploring', points: 2 },
            ],
          },
          options: [
            { value: 'ready', label: 'Yes, ready now', scoreValue: 10 },
            { value: 'maybe', label: 'Maybe', scoreValue: 5 },
            { value: 'exploring', label: 'Just exploring', scoreValue: 2 },
          ],
        },
      ],
    },
  ],
};

export const TEMPLATES = {
  rental: { label: 'Rental Application', config: RENTAL_TEMPLATE },
  buyer: { label: 'Buyer Inquiry', config: BUYER_TEMPLATE },
} as const;

export type TemplateName = keyof typeof TEMPLATES;
