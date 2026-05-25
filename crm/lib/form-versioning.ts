/**
 * Form config versioning utilities.
 *
 * Handles snapshotting form configs for immutable storage with
 * submissions, resolving the active form config for a space,
 * and converting stored submission data into human-readable
 * label-value pairs for display.
 */

import { supabase } from '@/lib/supabase';
import type {
  IntakeFormConfig,
  FormSection,
  FormQuestion,
  FormConfigSource,
  ApplicationData,
} from '@/lib/types';

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * Deep-clone a form config for storage alongside a submission.
 * This ensures the snapshot is completely detached from the
 * original object and safe for immutable storage.
 */
export function createFormSnapshot(config: IntakeFormConfig): IntakeFormConfig {
  return JSON.parse(JSON.stringify(config));
}

// ── Resolve active config ────────────────────────────────────────────────────

export interface ResolvedFormConfig {
  config: IntakeFormConfig | null;
  source: 'custom' | 'brokerage' | 'legacy';
}

/**
 * Canonical function to get the active form config for a space.
 *
 * Resolution order:
 *   1. SpaceSetting.formConfig if source is 'custom'
 *   2. Brokerage.brokerageFormConfig if source is 'brokerage'
 *   3. SpaceSetting.formConfig if present (fallback)
 *   4. null for legacy spaces with no dynamic form
 */
export async function resolveFormConfig(
  spaceId: string,
): Promise<ResolvedFormConfig> {
  const { data: setting, error: settingErr } = await supabase
    .from('SpaceSetting')
    .select('formConfig, formConfigSource')
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (settingErr) {
    console.error('[form-versioning] Failed to read SpaceSetting', settingErr);
    return { config: null, source: 'legacy' };
  }

  if (!setting) {
    return { config: null, source: 'legacy' };
  }

  const source: FormConfigSource = setting.formConfigSource ?? 'legacy';

  // Custom — use the space's own config
  if (source === 'custom' && setting.formConfig) {
    return { config: setting.formConfig as IntakeFormConfig, source: 'custom' };
  }

  // Brokerage — fetch from the brokerage row for the freshest version
  if (source === 'brokerage') {
    // First try the space's cached copy
    if (setting.formConfig) {
      return { config: setting.formConfig as IntakeFormConfig, source: 'brokerage' };
    }

    // Fall back to brokerage row
    const { data: space } = await supabase
      .from('Space')
      .select('brokerageId')
      .eq('id', spaceId)
      .maybeSingle();

    if (space?.brokerageId) {
      const { data: brokerage } = await supabase
        .from('Brokerage')
        .select('brokerageFormConfig')
        .eq('id', space.brokerageId)
        .maybeSingle();

      if (brokerage?.brokerageFormConfig) {
        return {
          config: brokerage.brokerageFormConfig as IntakeFormConfig,
          source: 'brokerage',
        };
      }
    }
  }

  // Has a config but no explicit source — treat it as custom
  if (setting.formConfig) {
    return { config: setting.formConfig as IntakeFormConfig, source: 'custom' };
  }

  return { config: null, source: 'legacy' };
}

// ── Submission display ──────────────────────────────────────────────────────

export interface DisplayField {
  label: string;
  value: string;
  sectionTitle?: string;
}

/**
 * Takes a contact's application data and form config snapshot and
 * returns human-readable label-value pairs for display.
 *
 * Falls back to the legacy display format if no snapshot exists.
 */
export function getSubmissionDisplay(contact: {
  applicationData: Record<string, any> | ApplicationData | null;
  formConfigSnapshot: IntakeFormConfig | null;
}): DisplayField[] {
  const { applicationData, formConfigSnapshot } = contact;

  if (!applicationData) return [];

  // ── Dynamic form mode ──────────────────────────────────────────────────
  if (formConfigSnapshot?.sections) {
    return getSnapshotDisplay(applicationData, formConfigSnapshot);
  }

  // ── Legacy mode (hardcoded ApplicationData fields) ─────────────────────
  return getLegacyDisplay(applicationData as ApplicationData);
}

function getSnapshotDisplay(
  answers: Record<string, any>,
  config: IntakeFormConfig,
): DisplayField[] {
  const fields: DisplayField[] = [];

  const sortedSections = [...config.sections].sort((a, b) => a.position - b.position);

  for (const section of sortedSections) {
    const sortedQuestions = [...section.questions].sort((a, b) => a.position - b.position);

    for (const question of sortedQuestions) {
      const rawValue = answers[question.id];
      if (rawValue == null || rawValue === '') continue;

      const displayValue = formatAnswerValue(rawValue, question);
      if (!displayValue) continue;

      fields.push({
        label: question.label,
        value: displayValue,
        sectionTitle: section.title,
      });
    }
  }

  return fields;
}

/**
 * Format a raw answer value based on question type for human display.
 */
export function formatAnswerValue(
  rawValue: any,
  question: FormQuestion,
): string {
  if (rawValue == null || rawValue === '') return '';

  switch (question.type) {
    case 'checkbox':
      return rawValue === true || rawValue === 'true' ? 'Yes' : 'No';

    case 'multi_select': {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      if (question.options?.length) {
        return values
          .map((v) => {
            const opt = question.options!.find((o) => o.value === v);
            return opt?.label ?? v;
          })
          .join(', ');
      }
      return values.join(', ');
    }

    case 'select':
    case 'radio': {
      if (question.options?.length) {
        const opt = question.options.find((o) => o.value === String(rawValue));
        return opt?.label ?? String(rawValue);
      }
      return String(rawValue);
    }

    case 'number':
      return String(rawValue);

    case 'date':
      // Try to format nicely, fall back to raw string
      try {
        const d = new Date(rawValue);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
        }
      } catch {
        // fall through
      }
      return String(rawValue);

    default:
      return String(rawValue);
  }
}

function getLegacyDisplay(app: ApplicationData): DisplayField[] {
  const fields: DisplayField[] = [];

  function add(label: string, value: any, section?: string) {
    if (value == null || value === '') return;
    const display =
      typeof value === 'boolean'
        ? value
          ? 'Yes'
          : 'No'
        : typeof value === 'number'
        ? String(value)
        : String(value);
    fields.push({ label, value: display, sectionTitle: section });
  }

  // Property
  add('Property address', app.propertyAddress, 'Property');
  add('Unit type', app.unitType, 'Property');
  add('Move-in date', app.targetMoveInDate, 'Property');
  add('Monthly rent', app.monthlyRent, 'Property');
  add('Lease term', app.leaseTermPreference, 'Property');
  add('Occupants', app.numberOfOccupants, 'Property');

  // Applicant
  add('Legal name', app.legalName, 'Applicant');
  add('Email', app.email, 'Applicant');
  add('Phone', app.phone, 'Applicant');
  add('Date of birth', app.dateOfBirth, 'Applicant');

  // Income
  add('Employment', app.employmentStatus, 'Income');
  add('Employer', app.employerOrSource, 'Income');
  add('Monthly gross income', app.monthlyGrossIncome, 'Income');
  add('Additional income', app.additionalIncome, 'Income');

  // Screening
  add('Prior evictions', app.priorEvictions, 'Screening');
  add('Outstanding balances', app.outstandingBalances, 'Screening');
  add('Bankruptcy', app.bankruptcy, 'Screening');
  add('Smoking', app.smoking, 'Screening');
  add('Has pets', app.hasPets, 'Screening');
  add('Pet details', app.petDetails, 'Screening');

  // Current living
  add('Current address', app.currentAddress, 'Current living');
  add('Housing status', app.currentHousingStatus, 'Current living');
  add('Current rent', app.currentRentPaid, 'Current living');
  add('Reason for moving', app.reasonForMoving, 'Current living');

  // Household
  add('Adults on application', app.adultsOnApplication, 'Household');
  add('Children/dependents', app.childrenOrDependents, 'Household');
  add('Co-renters', app.coRenters, 'Household');

  // Rental history
  add('Current landlord', app.currentLandlordName, 'Rental history');
  add('Previous landlord', app.previousLandlordName, 'Rental history');

  // Buyer-specific
  add('Pre-approval status', app.preApprovalStatus, 'Buyer');
  add('Pre-approval amount', app.preApprovalAmount, 'Buyer');
  add('Property type', app.propertyType, 'Buyer');
  add('Bedrooms', app.bedrooms, 'Buyer');
  add('Bathrooms', app.bathrooms, 'Buyer');
  add('Budget', app.buyerBudget, 'Buyer');
  add('Timeline', app.buyerTimeline, 'Buyer');

  // Notes
  add('Additional notes', app.additionalNotes, 'Notes');

  return fields;
}
