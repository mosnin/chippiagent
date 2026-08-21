/**
 * POST /api/agent/drafts — create is a send.
 *
 * Guards the owner contract: no pending writes, sendDraft is called,
 * failed delivery is an HTTP error with a failed row (never a pending
 * success).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

interface TableMock {
  single?: Record<string, unknown> | null;
  rows?: Array<Record<string, unknown>>;
  insertResult?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
}

let mockByTable: Record<string, TableMock> = {};
let lastInsertedDraft: Record<string, unknown> | null = null;
let lastEqCalls: Array<{ table: string; col: string; val: unknown }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table] ?? {};
    const rows = override.rows ?? [];
    const single = override.single;

    const termThen = Promise.resolve({ data: rows, error: null });
    const singleThen = Promise.resolve({ data: single ?? null, error: null });

    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn((col: string, val: unknown) => {
      lastEqCalls.push({ table, col, val });
      return chain;
    });
    chain.gte = vi.fn(pass);
    chain.order = vi.fn(pass);
    chain.limit = vi.fn(pass);
    chain.update = vi.fn(pass);
    chain.insert = vi.fn((row: Record<string, unknown>) => {
      if (table === 'AgentDraft') lastInsertedDraft = row;
      const insertSingle = Promise.resolve({
        data: override.insertResult ?? { id: 'draft_new', ...row },
        error: override.insertError ?? null,
      });
      return {
        ...chain,
        select: vi.fn(() => ({ single: vi.fn(() => insertSingle) })),
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => insertSingle.then(r, e),
      };
    });
    chain.maybeSingle = vi.fn(() => singleThen);
    chain.single = vi.fn(() => singleThen);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'clerk_1' })),
}));
vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({ id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' })),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));

const { sendDraftMock } = vi.hoisted(() => ({
  sendDraftMock: vi.fn(async () => ({ sent: true, method: 'sms' as const })),
}));
vi.mock('@/lib/delivery', () => ({ sendDraft: sendDraftMock }));

import { GET, POST } from '@/app/api/agent/drafts/route';
import { requireAuth } from '@/lib/api-auth';

function makePost(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/agent/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGet(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/agent/drafts${query}`, { method: 'GET' });
}

beforeEach(() => {
  mockByTable = {};
  lastInsertedDraft = null;
  lastEqCalls = [];
  sendDraftMock.mockReset();
  sendDraftMock.mockResolvedValue({ sent: true, method: 'sms' });
  vi.mocked(requireAuth).mockResolvedValue({ userId: 'clerk_1' });
});

describe('GET /api/agent/drafts', () => {
  it('defaults the status filter to sent, not pending', async () => {
    mockByTable.AgentDraft = { rows: [] };
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect(lastEqCalls.some((c) => c.table === 'AgentDraft' && c.col === 'status' && c.val === 'sent')).toBe(true);
    expect(lastEqCalls.some((c) => c.col === 'status' && c.val === 'pending')).toBe(false);
  });

  it('auth fail → unchanged NextResponse', async () => {
    const unauthorized = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    vi.mocked(requireAuth).mockResolvedValue(unauthorized);
    const res = await GET(makeGet());
    expect(res).toBe(unauthorized);
  });
});

describe('POST /api/agent/drafts', () => {
  it('sends via sendDraft and persists status=sent — never pending', async () => {
    mockByTable.Contact = { single: { id: 'c_1', name: 'Sam', email: null, phone: '+15551212' } };
    mockByTable.AgentDraft = { insertResult: { id: 'd_1', status: 'sent' } };

    const res = await POST(
      makePost({
        contactId: 'c_1',
        channel: 'sms',
        content: 'Hey Sam — still good for 3pm?',
        reasoning: 'tour completed',
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('sent');
    expect(body.status).toBe('sent');
    expect(sendDraftMock).toHaveBeenCalledOnce();
    expect(lastInsertedDraft).toMatchObject({
      status: 'sent',
      feedback_action: 'approved',
      channel: 'sms',
      contactId: 'c_1',
    });
    expect(lastInsertedDraft?.status).not.toBe('pending');
  });

  it('returns 502 and records a failed row when sendDraft cannot deliver', async () => {
    sendDraftMock.mockResolvedValueOnce({ sent: false, error: 'Contact has no phone number' });
    mockByTable.Contact = { single: { id: 'c_1', name: 'Sam', email: null, phone: null } };
    mockByTable.AgentDraft = { insertResult: { id: 'd_fail', status: 'approved' } };

    const res = await POST(
      makePost({
        contactId: 'c_1',
        channel: 'sms',
        content: 'Hey Sam',
        reasoning: 'follow up',
      }) as never,
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('Contact has no phone number');
    expect(body.status).toBe('approved');
    expect(lastInsertedDraft).toMatchObject({
      status: 'approved',
      feedback_action: 'rejected',
      outcome_signal: 'failed',
    });
    expect(lastInsertedDraft?.status).not.toBe('pending');
  });

  it('returns an existing sent draft in the 48h window instead of sending again', async () => {
    mockByTable.Contact = { single: { id: 'c_1', name: 'Sam', email: null, phone: '+1' } };
    mockByTable.AgentDraft = { single: { id: 'd_old', status: 'sent' } };

    const res = await POST(
      makePost({
        contactId: 'c_1',
        channel: 'sms',
        content: 'again',
        reasoning: 'dup',
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('deduped');
    expect(body.id).toBe('d_old');
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(lastInsertedDraft).toBeNull();
  });

  it('rejects missing contactId / empty content / email without subject', async () => {
    const missing = await POST(makePost({ channel: 'sms', content: 'hi' }) as never);
    expect(missing.status).toBe(400);

    mockByTable.Contact = { single: { id: 'c_1', name: 'Sam', email: 'a@b.c', phone: null } };
    const empty = await POST(makePost({ contactId: 'c_1', channel: 'sms', content: '  ' }) as never);
    expect(empty.status).toBe(400);

    const noSubject = await POST(
      makePost({ contactId: 'c_1', channel: 'email', content: 'body' }) as never,
    );
    expect(noSubject.status).toBe(400);
  });

  it('returns 404 when the contact is not in the space', async () => {
    mockByTable.Contact = { single: null };
    const res = await POST(
      makePost({ contactId: 'missing', channel: 'sms', content: 'hi' }) as never,
    );
    expect(res.status).toBe(404);
    expect(sendDraftMock).not.toHaveBeenCalled();
  });
});
