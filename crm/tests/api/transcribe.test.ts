/**
 * Route-level test for POST /api/chippi/transcribe.
 *
 * Covers: auth-fail (401), no-audio body (400), too-large file (413),
 * happy-path (whisper mocked → returns transcript).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

const transcriptionsCreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: class FakeOpenAI {
      audio = { transcriptions: { create: transcriptionsCreate } };
    },
  };
});

import { POST } from '@/app/api/chippi/transcribe/route';
import { requireAuth } from '@/lib/api-auth';

const mockRequireAuth = vi.mocked(requireAuth);

function makeReq(form: FormData): NextRequest {
  return new NextRequest('http://localhost/api/chippi/transcribe', {
    method: 'POST',
    body: form,
  });
}

describe('POST /api/chippi/transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const fd = new FormData();
    fd.append('audio', new File([new Uint8Array([1, 2, 3])], 't.webm', { type: 'audio/webm' }));
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(401);
  });

  it('returns 400 when no audio file is present', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
    const fd = new FormData();
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(400);
  });

  it('returns 413 when audio exceeds 25MB', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
    // Real File of >25MB — the route reads .size off the underlying Blob,
    // so we have to actually back it with that many bytes. Buffer is cheap.
    const big = new File([new Uint8Array(26 * 1024 * 1024)], 'big.webm', { type: 'audio/webm' });
    const fd = new FormData();
    fd.append('audio', big);
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(413);
  });

  it('returns transcript on happy path', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
    transcriptionsCreate.mockResolvedValue('Sam loved it. Follow up Friday.');
    const fd = new FormData();
    fd.append('audio', new File([new Uint8Array([1, 2, 3])], 't.webm', { type: 'audio/webm' }));
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { transcript: string };
    expect(json.transcript).toBe('Sam loved it. Follow up Friday.');
    expect(transcriptionsCreate).toHaveBeenCalledOnce();
  });
});
