import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { FORM_TEMPLATES } from '@/lib/form-config-templates';

/**
 * GET /api/form-config/templates
 * Returns array of built-in form templates.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(FORM_TEMPLATES);
}
