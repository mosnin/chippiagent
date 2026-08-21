import { describe, it, expect } from 'vitest';
import { buildDraftPatchBody } from '@/components/agent/agent-draft-inbox';

describe('buildDraftPatchBody', () => {
  it('sends status=approved — the field the drafts PATCH route actually reads', () => {
    expect(buildDraftPatchBody('approved')).toEqual({ status: 'approved' });
  });

  it('includes edited content when the realtor changed the draft', () => {
    expect(buildDraftPatchBody('approved', 'Hey Sarah — still on for 3?')).toEqual({
      status: 'approved',
      content: 'Hey Sarah — still on for 3?',
    });
  });

  it('sends status=dismissed without inventing an action key', () => {
    const body = buildDraftPatchBody('dismissed');
    expect(body).toEqual({ status: 'dismissed' });
    expect(body).not.toHaveProperty('action');
  });

  it('never uses action as the status field — that 400s and blocks send', () => {
    const body = buildDraftPatchBody('approved', 'ping');
    expect(body).not.toHaveProperty('action');
    expect(body.status).toBe('approved');
  });
});
