/**
 * GET /api/agent/portfolio
 *
 * Computes a fresh cross-portfolio analysis for the space on every request:
 * contact health metrics, deal pipeline stats, and narrative insights.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';

interface ContactRow {
  leadScore: number | null;
  leadType: string | null;
  lastContactedAt: string | null;
  followUpAt: string | null;
  type: string | null;
}

interface DealRow {
  value: number | null;
  probability: number | null;
  closeDate: string | null;
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch contacts and active deals in parallel
  const [contactsResult, dealsResult] = await Promise.all([
    supabase
      .from('Contact')
      .select('leadScore, leadType, lastContactedAt, followUpAt, type')
      .eq('spaceId', space.id)
      .limit(2000),
    supabase
      .from('Deal')
      .select('value, probability, closeDate')
      .eq('spaceId', space.id)
      .eq('status', 'active')
      .limit(500),
  ]);

  if (contactsResult.error) throw contactsResult.error;
  if (dealsResult.error) throw dealsResult.error;

  const contacts: ContactRow[] = contactsResult.data ?? [];
  const deals: DealRow[] = dealsResult.data ?? [];

  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cutoff14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const closing14dCutoff = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD

  // --- Contact metrics -------------------------------------------------------
  const contactCount = contacts.length;

  const highScoreCount = contacts.filter(c => (c.leadScore ?? 0) >= HOT_LEAD_THRESHOLD).length;

  function isOverdue(c: ContactRow): boolean {
    if (c.followUpAt) {
      return new Date(c.followUpAt) < now;
    }
    // Fallback: no followUpAt but not contacted in 30+ days
    if (!c.lastContactedAt) return true;
    return new Date(c.lastContactedAt) < cutoff30d;
  }
  const overdueFollowupCount = contacts.filter(isOverdue).length;

  const rentalCount = contacts.filter(c => c.leadType === 'RENTAL').length;
  const buyerCount = contacts.filter(c => c.leadType === 'BUYER').length;
  const rentalPct = contactCount ? Math.round((rentalCount / contactCount) * 1000) / 10 : 0;
  const buyerPct = contactCount ? Math.round((buyerCount / contactCount) * 1000) / 10 : 0;

  const scores = contacts.map(c => c.leadScore ?? 0);
  const avgLeadScore = contactCount
    ? Math.round((scores.reduce((a, b) => a + b, 0) / contactCount) * 10) / 10
    : 0;

  const engagedCount = contacts.filter(c => {
    if (!c.lastContactedAt) return false;
    return new Date(c.lastContactedAt) >= cutoff14d;
  }).length;
  const engagementRatePct = contactCount
    ? Math.round((engagedCount / contactCount) * 1000) / 10
    : 0;

  // --- Deal metrics ----------------------------------------------------------
  const pipelineValue = deals.reduce((sum, d) => {
    return sum + (d.value ?? 0) * ((d.probability ?? 0) / 100);
  }, 0);

  const dealsClosing14d = deals.filter(
    d => d.closeDate != null && d.closeDate <= closing14dCutoff,
  ).length;

  // --- Narrative insights ----------------------------------------------------
  const insights: string[] = [];

  if (engagementRatePct < 30) {
    insights.push(
      `Only ${engagementRatePct}% of contacts have been touched in the past 14 days` +
        ' — consider activating the Long-Term Nurture agent.',
    );
  }

  if (dealsClosing14d > 0) {
    insights.push(`${dealsClosing14d} deal(s) closing within 14 days need priority attention.`);
  }

  if (highScoreCount > 5) {
    insights.push(
      `${highScoreCount} hot people (score ≥ ${HOT_LEAD_THRESHOLD}) are in the pipeline` +
        ' — prioritize these for personal outreach.',
    );
  }

  if (avgLeadScore < 40 && insights.length === 0) {
    insights.push(
      `Portfolio average score is low (${avgLeadScore}/100)` +
        ' — a scoring pass could surface hidden opportunities.',
    );
  }

  if (insights.length === 0) {
    if (overdueFollowupCount > 0) {
      insights.push(
        `${overdueFollowupCount} contact(s) have overdue follow-ups` +
          ' — review and reschedule to keep the pipeline healthy.',
      );
    } else {
      insights.push(
        `Portfolio looks healthy: ${contactCount} contacts, avg score ${avgLeadScore}/100,` +
          ` pipeline value $${Math.round(pipelineValue).toLocaleString()}.`,
      );
    }
  }

  return NextResponse.json({
    contact_count: contactCount,
    high_score_count: highScoreCount,
    overdue_followup_count: overdueFollowupCount,
    rental_pct: rentalPct,
    buyer_pct: buyerPct,
    pipeline_value: Math.round(pipelineValue * 100) / 100,
    deals_closing_14d: dealsClosing14d,
    avg_lead_score: avgLeadScore,
    engagement_rate_pct: engagementRatePct,
    insights,
  });
}
