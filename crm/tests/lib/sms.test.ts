import { describe, it, expect } from 'vitest';
import {
  newLeadSMS,
  newTourSMS,
  tourConfirmationSMS,
  newDealSMS,
  toE164,
  isBlockedSmsDestination,
} from '@/lib/sms';

describe('toE164', () => {
  it('passes through a valid E.164 number', () => {
    expect(toE164('+15551234567')).toBe('+15551234567');
  });

  it('normalizes the intake (XXX) XXX-XXXX shape', () => {
    expect(toE164('(555) 123-4567')).toBe('+15551234567');
  });

  it('normalizes a 10-digit US number', () => {
    expect(toE164('5551234567')).toBe('+15551234567');
  });

  it('normalizes an 11-digit number that already includes the US country code', () => {
    expect(toE164('15551234567')).toBe('+15551234567');
  });

  it('normalizes +1 with spaces and dashes', () => {
    expect(toE164('+1 (555) 123-4567')).toBe('+15551234567');
  });

  it('fails closed on junk and too-short input', () => {
    expect(toE164('')).toBeNull();
    expect(toE164('123')).toBeNull();
    expect(toE164('not-a-phone')).toBeNull();
  });
});

describe('isBlockedSmsDestination', () => {
  it('blocks US premium-rate prefixes', () => {
    expect(isBlockedSmsDestination('+19005551212')).toBe(true);
    expect(isBlockedSmsDestination('+15551234567')).toBe(false);
  });
});

describe('SMS template builders', () => {
  it('newLeadSMS targets the owner phone', () => {
    const result = newLeadSMS({
      spaceName: 'Acme',
      leadName: 'Jane',
      phone: '+15551230000',
    });
    expect(result.to).toBe('+15551230000');
    expect(result.body).toContain('Acme');
    expect(result.body).toContain('Jane');
  });

  it('newLeadSMS includes the score label and lead phone when provided', () => {
    const result = newLeadSMS({
      spaceName: 'Acme',
      leadName: 'Jane',
      leadPhone: '+15551234567',
      phone: '+15559990000',
      scoreLabel: 'hot',
    });
    expect(result.body).toContain('(hot)');
    expect(result.body).toContain('+15551234567');
  });

  it('newTourSMS formats date, time, and property', () => {
    const result = newTourSMS({
      spaceName: 'Acme',
      guestName: 'Bob',
      date: 'Mar 5',
      time: '2:00 PM',
      property: '123 Main St',
      phone: '+15550000000',
    });
    expect(result.body).toContain('Mar 5');
    expect(result.body).toContain('2:00 PM');
    expect(result.body).toContain('123 Main St');
  });

  it('tourConfirmationSMS targets the guest, not the owner', () => {
    const result = tourConfirmationSMS({
      guestName: 'Bob',
      guestPhone: '+15551112222',
      businessName: 'Acme',
      date: 'Mar 5',
      time: '2 PM',
    });
    expect(result.to).toBe('+15551112222');
    expect(result.body.startsWith('Hi Bob')).toBe(true);
  });

  it('newDealSMS includes value only when present', () => {
    const withValue = newDealSMS({
      spaceName: 'Acme',
      dealTitle: '123 Elm',
      value: '$1.2M',
      phone: '+15550000000',
    });
    expect(withValue.body).toContain('$1.2M');

    const withoutValue = newDealSMS({
      spaceName: 'Acme',
      dealTitle: '123 Elm',
      phone: '+15550000000',
    });
    expect(withoutValue.body).not.toContain('(');
  });
});
