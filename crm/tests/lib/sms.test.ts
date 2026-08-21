import { describe, it, expect } from 'vitest';
import {
  newLeadSMS,
  newTourSMS,
  tourConfirmationSMS,
  newDealSMS,
  telnyxAcceptedSend,
  toE164,
} from '@/lib/sms';

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

describe('toE164', () => {
  it('does not prefix +1 onto an 11-digit US number that already has the country code', () => {
    expect(toE164('15551234567')).toBe('+15551234567');
    expect(toE164('1-555-123-4567')).toBe('+15551234567');
  });

  it('prefixes +1 onto a 10-digit US number', () => {
    expect(toE164('5551234567')).toBe('+15551234567');
    expect(toE164('(555) 123-4567')).toBe('+15551234567');
  });

  it('keeps a valid E.164 number unchanged', () => {
    expect(toE164('+15551234567')).toBe('+15551234567');
    expect(toE164('+44 7911 123456')).toBe('+447911123456');
  });

  it('refuses an international number without + instead of guessing +1', () => {
    expect(toE164('447911123456')).toBeNull();
    expect(toE164('0015551234567')).toBeNull();
  });

  it('refuses numbers that are too short or empty', () => {
    expect(toE164('')).toBeNull();
    expect(toE164('12345')).toBeNull();
    expect(toE164('+123456789')).toBeNull();
  });
});

describe('telnyxAcceptedSend', () => {
  it('requires a message id before treating the provider response as a send', () => {
    expect(telnyxAcceptedSend({ data: { id: 'msg_123' } })).toBe(true);
    expect(telnyxAcceptedSend({ id: 'msg_123' })).toBe(true);
    expect(telnyxAcceptedSend({ data: {} })).toBe(false);
    expect(telnyxAcceptedSend({})).toBe(false);
    expect(telnyxAcceptedSend(null)).toBe(false);
    expect(telnyxAcceptedSend({ data: { id: '' } })).toBe(false);
  });
});
