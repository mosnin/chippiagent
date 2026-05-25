/**
 * POST /api/chippi/transcribe
 *
 * Accepts a multipart audio blob, runs OpenAI Whisper, returns
 * `{ transcript: string }`.
 *
 * Auth: requireAuth. Rate-limited per-user. Audio is processed in-memory
 * and never persisted — privacy first. Whisper enforces a 25MB upper bound;
 * we mirror that here so a misbehaving client gets a clean 413 instead of a
 * Whisper-side error.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`chippi:transcribe:${userId}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audio = formData.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio too long. Try a shorter take.' }, { status: 413 });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: 'whisper-1',
      response_format: 'text',
    });
    const transcript = (typeof transcription === 'string' ? transcription : '').trim();
    return NextResponse.json({ transcript });
  } catch (err) {
    console.error('[chippi/transcribe] error', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
