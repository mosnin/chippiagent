import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { scoreDynamicApplication } from '@/lib/dynamic-lead-scoring';
import type { IntakeFormConfig } from '@/lib/types';

/**
 * POST /api/form-config/optimize/score-preview
 *
 * Runs the scoring pipeline with sample answers for testing purposes.
 * Does NOT save anything — purely a simulation endpoint.
 *
 * Body: { slug, formConfig, answers }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = body.slug as string | undefined;
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  const formConfig = body.formConfig as IntakeFormConfig | undefined;
  const answers = body.answers as Record<string, string | string[] | number | boolean> | undefined;

  if (!formConfig?.sections?.length) {
    return NextResponse.json({ error: 'formConfig is required' }, { status: 400 });
  }
  if (!answers || Object.keys(answers).length === 0) {
    return NextResponse.json({ error: 'answers are required' }, { status: 400 });
  }

  try {
    // Use a fake contactId since we're not saving anything
    const result = await scoreDynamicApplication({
      contactId: 'preview-test',
      formConfig,
      answers,
      leadType: formConfig.leadType ?? 'rental',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[score-preview] scoring failed', error);

    const message = error instanceof Error ? error.message : '';
    const lower = message.toLowerCase();

    if (lower.includes('openai') || lower.includes('api key') || lower.includes('rate_limit')) {
      return NextResponse.json(
        { error: 'The scoring service is temporarily unavailable. Please try again in a moment.' },
        { status: 502 },
      );
    }
    if (lower.includes('scoring') || lower.includes('config')) {
      return NextResponse.json(
        { error: 'Scoring could not run. Make sure your form has scoring rules configured in the Builder tab.' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong while scoring. Please try again or contact support if this continues.' },
      { status: 500 },
    );
  }
}
