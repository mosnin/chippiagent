import { describe, it, expect } from 'vitest';
import {
  getDefaultFormConfig,
  resolveApplyFormConfig,
  submissionMatchesFormConfig,
} from '@/lib/form-builder';
import { buildApplicationData } from '@/lib/public-application';
import { getSubmissionDisplay } from '@/lib/form-versioning';

const MOVE_TIMING_ID = '10000000-0000-4000-b000-000000000001';
const LOCATION_ID = '10000000-0000-4000-b000-000000000002';
const BUDGET_ID = '10000000-0000-4000-b000-000000000003';
const BUYER_BUDGET_ID = '20000000-0000-4000-b000-000000000001';

function defaultRentalAnswers() {
  return {
    slug: 'jordan-realty',
    name: 'Alex Johnson',
    legalName: 'Alex Johnson',
    email: 'alex@example.com',
    phone: '(555) 123-4567',
    [MOVE_TIMING_ID]: 'asap',
    [LOCATION_ID]: 'Brickell',
    [BUDGET_ID]: '2500',
  };
}

describe('submissionMatchesFormConfig', () => {
  const rental = getDefaultFormConfig('rental');
  const buyer = getDefaultFormConfig('buyer');

  it('matches an IntakeChat default-rental payload by UUID question ids', () => {
    expect(submissionMatchesFormConfig(defaultRentalAnswers(), rental)).toBe(true);
  });

  it('does not match a legacy legalName/email/phone payload', () => {
    expect(
      submissionMatchesFormConfig(
        {
          slug: 'jordan-realty',
          legalName: 'Alex Johnson',
          email: 'alex@example.com',
          phone: '(555) 123-4567',
          monthlyRent: 2500,
          targetMoveInDate: 'asap',
        },
        rental,
      ),
    ).toBe(false);
  });

  it('does not treat system fields alone as a default-form match', () => {
    expect(
      submissionMatchesFormConfig(
        { name: 'Alex', email: 'alex@example.com', phone: '5551234567' },
        rental,
      ),
    ).toBe(false);
  });

  it('matches a default buyer payload', () => {
    expect(
      submissionMatchesFormConfig({ [BUYER_BUDGET_ID]: '450000' }, buyer),
    ).toBe(true);
  });
});

describe('resolveApplyFormConfig', () => {
  const rental = getDefaultFormConfig('rental');

  it('keeps a stored custom config', () => {
    const custom = { ...rental, version: 9 };
    expect(resolveApplyFormConfig(custom, 'rental', defaultRentalAnswers())).toBe(custom);
  });

  it('uses the default rental template when the space has no stored config', () => {
    const resolved = resolveApplyFormConfig(null, 'rental', defaultRentalAnswers());
    expect(resolved).toBe(rental);
    expect(resolved?.leadType).toBe('rental');
  });

  it('stays on the legacy path for old schema payloads', () => {
    expect(
      resolveApplyFormConfig(null, 'rental', {
        slug: 'jordan-realty',
        legalName: 'Alex Johnson',
        email: 'alex@example.com',
        phone: '(555) 123-4567',
      }),
    ).toBeNull();
  });
});

describe('default-form answers are not dropped', () => {
  it('legacy buildApplicationData strips UUID-keyed answers (the bug)', () => {
    const parsed = {
      slug: 'jordan-realty',
      legalName: 'Alex Johnson',
      email: 'alex@example.com',
      phone: '(555) 123-4567',
      leadType: 'rental' as const,
    };
    const stored = buildApplicationData(parsed);
    expect(stored).not.toHaveProperty(MOVE_TIMING_ID);
    expect(stored).not.toHaveProperty(LOCATION_ID);
    expect(stored).not.toHaveProperty(BUDGET_ID);
  });

  it('legacy display hides default-form answers without a snapshot', () => {
    const fields = getSubmissionDisplay({
      applicationData: defaultRentalAnswers(),
      formConfigSnapshot: null,
    });
    expect(fields.some((f) => f.value === 'Brickell')).toBe(false);
    expect(fields.some((f) => f.value.includes('ASAP'))).toBe(false);
  });

  it('snapshot display keeps default-form answers the realtor asked', () => {
    const fields = getSubmissionDisplay({
      applicationData: defaultRentalAnswers(),
      formConfigSnapshot: getDefaultFormConfig('rental'),
    });
    expect(fields.some((f) => f.value === 'Brickell')).toBe(true);
    expect(fields.some((f) => String(f.value).includes('ASAP'))).toBe(true);
    expect(fields.some((f) => f.value === '2500')).toBe(true);
  });
});
