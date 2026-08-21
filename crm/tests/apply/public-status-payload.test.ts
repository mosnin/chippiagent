import { describe, it, expect } from 'vitest';
import {
  PUBLIC_STATUS_CONTACT_COLUMNS,
  PORTAL_STATUS_CONTACT_COLUMNS,
  statusContactColumns,
  toPublicStatusContact,
} from '@/app/apply/[slug]/status/public-status-payload';

const PII_COLUMNS = [
  'applicationData',
  'formConfigSnapshot',
  'email',
  'phone',
  'statusPortalToken',
  'scoringStatus',
  'scoreDetails',
  'scoreSummary',
];

const leakedAnswers = {
  legalName: 'Jordan Applicant',
  email: 'jordan@example.com',
  phone: '+15551234567',
  dateOfBirth: '1991-04-12',
  currentAddress: '1 Main St',
  monthlyGrossIncome: 7200,
  priorEvictions: true,
  creditScore: 640,
};

const row = {
  name: 'Jordan Applicant',
  applicationStatus: 'under_review' as const,
  applicationStatusNote: 'Need pay stubs',
  applicationRef: 'a'.repeat(64),
  applicationData: leakedAnswers,
  formConfigSnapshot: { id: 'cfg-1' } as never,
  createdAt: '2026-08-21T00:00:00.000Z',
};

describe('status contact column lists', () => {
  it('omits application PII from the token-less SELECT', () => {
    for (const column of PII_COLUMNS) {
      expect(PUBLIC_STATUS_CONTACT_COLUMNS).not.toContain(column);
    }
    expect(statusContactColumns(false)).toBe(PUBLIC_STATUS_CONTACT_COLUMNS);
  });

  it('only adds application answers when a portal token is present', () => {
    expect(statusContactColumns(true)).toBe(PORTAL_STATUS_CONTACT_COLUMNS);
    expect(PORTAL_STATUS_CONTACT_COLUMNS).toContain('applicationData');
    expect(PORTAL_STATUS_CONTACT_COLUMNS).toContain('formConfigSnapshot');
    expect(PORTAL_STATUS_CONTACT_COLUMNS).not.toContain('email');
    expect(PORTAL_STATUS_CONTACT_COLUMNS).not.toContain('statusPortalToken');
  });
});

describe('toPublicStatusContact', () => {
  it('strips application answers from the RSC payload without a portal token', () => {
    const payload = toPublicStatusContact(row, false, 'fallback-ref');
    expect(payload.applicationData).toBeNull();
    expect(payload.formConfigSnapshot).toBeNull();
    expect(payload.name).toBe('Jordan Applicant');
    expect(payload.status).toBe('under_review');
    expect(payload.statusNote).toBe('Need pay stubs');
    expect(payload.applicationRef).toBe(row.applicationRef);
    expect(JSON.stringify(payload)).not.toContain('jordan@example.com');
    expect(JSON.stringify(payload)).not.toContain('priorEvictions');
    expect(JSON.stringify(payload)).not.toContain('7200');
  });

  it('keeps application answers for a valid portal-token session', () => {
    const payload = toPublicStatusContact(row, true, 'fallback-ref');
    expect(payload.applicationData).toEqual(leakedAnswers);
    expect(payload.formConfigSnapshot).toEqual({ id: 'cfg-1' });
  });

  it('does not invent PII when the row omitted application columns', () => {
    const payload = toPublicStatusContact(
      {
        name: 'Jordan Applicant',
        applicationStatus: null,
        applicationStatusNote: null,
        applicationRef: null,
        createdAt: row.createdAt,
      },
      false,
      'fallback-ref',
    );
    expect(payload.status).toBe('received');
    expect(payload.applicationRef).toBe('fallback-ref');
    expect(payload.applicationData).toBeNull();
    expect(payload.formConfigSnapshot).toBeNull();
  });
});
