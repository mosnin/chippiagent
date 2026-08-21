/**
 * Completion lines after Chippi already acted. These are not an approval
 * gate and do not wait on a human tap. Tests pin the spoken sentence and
 * the tool-name → kind map so consumers keep a stable autonomous voice.
 */
import { describe, it, expect } from 'vitest';
import {
  APPROVAL_DWELL_MS,
  approvalKindForTool,
  approvalSubjectFromArgs,
  getApprovalSentence,
  type ApprovalKind,
} from '@/components/chippi/approval-celebration';

describe('getApprovalSentence — autonomous completion, not a human wait', () => {
  it('renders the email line', () => {
    expect(getApprovalSentence('email')).toBe("Sent. I'll watch for a reply.");
  });

  it('renders the SMS line', () => {
    expect(getApprovalSentence('sms')).toBe("Sent. I'll let you know if they reply.");
  });

  it('renders the note line', () => {
    expect(getApprovalSentence('note')).toBe("Logged. It's in the timeline.");
  });

  it('renders the stage-moved line', () => {
    expect(getApprovalSentence('stage')).toBe('Moved. The board reflects it.');
  });

  it('renders the tour line', () => {
    expect(getApprovalSentence('tour')).toBe(
      "On the calendar. I'll prep them the day before.",
    );
  });

  it('names the hot direction with a name when given one', () => {
    expect(getApprovalSentence('person-hot', 'Sarah')).toBe("Got it. Sarah's hot now.");
  });

  it('names the cold direction with a name when given one', () => {
    expect(getApprovalSentence('person-cold', 'Sarah')).toBe("Got it. Sarah's cold now.");
  });

  it('keeps the hot line natural when no name is available', () => {
    expect(getApprovalSentence('person-hot')).toBe("Got it. They're hot now.");
  });

  it('keeps the cold line natural when no name is available', () => {
    expect(getApprovalSentence('person-cold')).toBe("Got it. They're cold now.");
  });

  it('weaves a date phrase into the followup line', () => {
    expect(getApprovalSentence('followup', 'Friday')).toBe(
      "Set for Friday. I'll surface it.",
    );
  });

  it('falls back gracefully when the followup subject is missing', () => {
    expect(getApprovalSentence('followup')).toBe("Set. I'll surface it.");
  });

  it('never crashes on an unknown kind — falls back to a calm "Done."', () => {
    expect(getApprovalSentence('unknown' as ApprovalKind)).toBe('Done.');
  });

  it('trims whitespace-only subjects so we do not render an awkward sentence', () => {
    expect(getApprovalSentence('person-hot', '   ')).toBe("Got it. They're hot now.");
    expect(getApprovalSentence('person-cold', '   ')).toBe("Got it. They're cold now.");
  });
});

describe('approvalKindForTool', () => {
  it.each([
    ['send_email', 'email'],
    ['log_email_sent', 'email'],
    ['send_sms', 'sms'],
    ['log_sms_sent', 'sms'],
    ['note_on_person', 'note'],
    ['note_on_deal', 'note'],
    ['note_on_property', 'note'],
    ['log_call', 'note'],
    ['log_meeting', 'note'],
    ['move_deal_stage', 'stage'],
    ['schedule_tour', 'tour'],
    ['reschedule_tour', 'tour'],
    ['mark_person_hot', 'person-hot'],
    ['mark_person_cold', 'person-cold'],
    ['set_followup', 'followup'],
  ] as Array<[string, ApprovalKind]>)('maps %s → %s', (tool, kind) => {
    expect(approvalKindForTool(tool)).toBe(kind);
  });

  it('returns null for tools that do not speak a completion line', () => {
    expect(approvalKindForTool('find_person')).toBeNull();
    expect(approvalKindForTool('draft_email')).toBeNull();
    expect(approvalKindForTool('draft_sms')).toBeNull();
    expect(approvalKindForTool('cancel_tour')).toBeNull();
    expect(approvalKindForTool('pipeline_summary')).toBeNull();
    expect(approvalKindForTool('made_up_tool')).toBeNull();
  });
});

describe('approvalSubjectFromArgs', () => {
  it('pulls the date phrase out of set_followup args', () => {
    expect(approvalSubjectFromArgs('set_followup', { when: 'Friday' })).toBe('Friday');
  });

  it('returns undefined when set_followup args are missing the when field', () => {
    expect(approvalSubjectFromArgs('set_followup', {})).toBeUndefined();
  });

  it('returns undefined for tools with no extractable subject', () => {
    expect(
      approvalSubjectFromArgs('mark_person_hot', { personId: 'abc-123', why: 'asked twice' }),
    ).toBeUndefined();
    expect(approvalSubjectFromArgs('send_email', { toEmail: 'x@y.z' })).toBeUndefined();
  });
});

describe('APPROVAL_DWELL_MS', () => {
  it('is a display dwell after work already ran — not a human approval wait', () => {
    expect(APPROVAL_DWELL_MS).toBe(2500);
  });
});
