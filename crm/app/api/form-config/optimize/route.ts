import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabase } from '@/lib/supabase';
import {
  analyzeFormPerformance,
  generateOptimizationSuggestions,
  getCachedSuggestions,
  setCachedSuggestions,
} from '@/lib/form-optimization';
import type { IntakeFormConfig } from '@/lib/types';

const MIN_SUBMISSIONS = 10;

/**
 * POST /api/form-config/optimize
 *
 * Analyzes submission data and scoring patterns for a space's intake form
 * and returns optimization suggestions (deterministic + AI-powered).
 *
 * Body: { slug: string; skipCache?: boolean }
 * Rate limit: 5 calls per hour per space
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
  const { space } = auth;

  // Rate limit: 5 calls per hour per space (AI calls are expensive)
  const { allowed } = await checkRateLimit(
    `form-optimize:${space.id}`,
    5,
    3600,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Optimization suggestions can be refreshed up to 5 times per hour.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI optimization is not configured on this server.' },
      { status: 503 },
    );
  }

  // Check cache (unless explicitly asked to skip)
  const skipCache = body.skipCache === true;
  if (!skipCache) {
    const cached = getCachedSuggestions(space.id);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  try {
    // Fetch current form config
    const { data: settings } = await supabase
      .from('SpaceSetting')
      .select('formConfig')
      .eq('spaceId', space.id)
      .maybeSingle();

    const formConfig = settings?.formConfig as IntakeFormConfig | null;
    if (!formConfig?.sections?.length) {
      return NextResponse.json(
        { error: 'No custom form configured. Set up a form in the form builder first.' },
        { status: 400 },
      );
    }

    // Analyze form performance
    const performance = await analyzeFormPerformance(space.id);

    if (performance.totalSubmissions < MIN_SUBMISSIONS) {
      return NextResponse.json({
        performance,
        suggestions: [],
        generatedAt: new Date().toISOString(),
        message: `Not enough data yet. We need at least ${MIN_SUBMISSIONS} submissions to generate suggestions (currently ${performance.totalSubmissions}).`,
      });
    }

    // Generate suggestions (deterministic + AI)
    const suggestions = await generateOptimizationSuggestions(performance, formConfig);

    const result = {
      performance,
      suggestions,
      generatedAt: new Date().toISOString(),
    };

    // Cache for 1 hour
    setCachedSuggestions(space.id, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[form-config/optimize] failed', error);

    // Provide structured, user-facing error messages based on failure type
    const message = error instanceof Error ? error.message : '';
    const lower = message.toLowerCase();

    if (lower.includes('openai') || lower.includes('api key') || lower.includes('rate_limit')) {
      return NextResponse.json(
        { error: 'AI analysis is temporarily unavailable. Your data-driven suggestions may still appear. Please try again in a minute.' },
        { status: 502 },
      );
    }
    if (lower.includes('timeout') || lower.includes('econnrefused')) {
      return NextResponse.json(
        { error: 'The analysis timed out. This can happen with large datasets. Please try again.' },
        { status: 504 },
      );
    }
    if (lower.includes('fetch') || lower.includes('submission')) {
      return NextResponse.json(
        { error: 'Could not load your submission data. Please check your connection and try again.' },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: 'Something unexpected went wrong while analyzing your form. Please try again or contact support if this persists.' },
      { status: 500 },
    );
  }
}
