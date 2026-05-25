import { supabase } from '@/lib/supabase';
import type { ApplicationData, LeadScoreDetails } from '@/lib/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function monthKey(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function buildMonthBuckets(dates: Date[], months: string[]): { month: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const m of months) counts[m] = 0;
  for (const d of dates) {
    const key = monthKey(d);
    if (key in counts) counts[key] = (counts[key] ?? 0) + 1;
  }
  return months.map((m) => ({ month: m, count: counts[m] ?? 0 }));
}

function last6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  return months;
}

function daysUntil(dateStr: string): number | null {
  try {
    const target = new Date(dateStr);
    if (isNaN(target.getTime())) return null;
    return Math.ceil((target.getTime() - Date.now()) / 86_400_000);
  } catch {
    return null;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface LabelCount {
  label: string;
  count: number;
}

export interface MonthBucket {
  month: string;
  count: number;
}

export interface StageBar {
  name: string;
  count: number;
  value: number;
  color: string;
}

export interface AvgScoreMonth {
  month: string;
  avg: number | null;
}

// Sub-page data types

export interface OverviewData {
  totalLeads: number;
  totalContacts: number;
  totalDeals: number;
  totalPipelineValue: number;
  leadsOverTime: MonthBucket[];
  dealsByStage: StageBar[];
}

export interface LeadsAnalyticsData {
  totalLeads: number;
  avgLeadScore: number | null;
  leadsOverTime: MonthBucket[];
  leadScoreBuckets: LabelCount[];
  leadStateDistribution: LabelCount[];
  topRiskFlags: LabelCount[];
  avgScoreByMonth: AvgScoreMonth[];
  // qualification
  employmentBreakdown: LabelCount[];
  affordabilityBuckets: LabelCount[];
  screeningFlags: LabelCount[];
  moveInUrgency: LabelCount[];
  // lead type
  buyerLeadCount: number;
  rentalLeadCount: number;
  buyerBudgetDistribution: LabelCount[];
}

export interface ClientsAnalyticsData {
  totalContacts: number;
  contactsOverTime: MonthBucket[];
  contactsByStage: LabelCount[];
  contactFunnel: { label: string; count: number; rate: number }[];
  leadToClientRate: number;
  totalLeads: number;
}

export interface ToursAnalyticsData {
  totalTours: number;
  completedTours: number;
  cancelledTours: number;
  noShowTours: number;
  scheduledTours: number;
  toursConvertedToDeals: number;
  tourConversionRate: number;
  toursByStatus: LabelCount[];
  toursOverTime: MonthBucket[];
}

export interface PipelineAnalyticsData {
  totalDeals: number;
  activeDeals: number;
  totalPipelineValue: number;
  dealWinRate: number;
  wonDeals: number;
  lostDeals: number;
  avgDealSize: number;
  dealsByStage: StageBar[];
  dealsByPriority: LabelCount[];
  dealsOverTime: MonthBucket[];
}

// ── Raw data fetcher ───────────────────────────────────────────────────────

interface RawData {
  contacts: {
    id: string;
    type: string;
    tags: string[];
    leadScore: number | null;
    scoreLabel: string | null;
    scoringStatus: string | null;
    createdAt: string;
    applicationData: ApplicationData | null;
    scoreDetails: LeadScoreDetails | null;
    leadType: 'rental' | 'buyer';
  }[];
  deals: {
    id: string;
    value: number | null;
    stageId: string;
    priority: string;
    createdAt: string;
    status: string;
    sourceTourId: string | null;
  }[];
  stages: {
    id: string;
    name: string;
    color: string;
  }[];
  tours: {
    id: string;
    status: string;
    createdAt: string;
  }[];
}

export async function fetchRawAnalyticsData(spaceId: string): Promise<RawData> {
  const [contactsRes, dealsRes, stagesRes, toursRes] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, type, tags, leadScore, scoreLabel, scoringStatus, createdAt, applicationData, scoreDetails, leadType')
      .eq('spaceId', spaceId),
    supabase
      .from('Deal')
      .select('id, value, stageId, priority, createdAt, status, sourceTourId')
      .eq('spaceId', spaceId),
    supabase
      .from('DealStage')
      .select('id, name, color')
      .eq('spaceId', spaceId),
    supabase
      .from('Tour')
      .select('id, status, createdAt')
      .eq('spaceId', spaceId),
  ]);

  return {
    contacts: (contactsRes.data ?? []) as RawData['contacts'],
    deals: (dealsRes.data ?? []) as RawData['deals'],
    stages: (stagesRes.data ?? []) as RawData['stages'],
    tours: (toursRes.data ?? []) as RawData['tours'],
  };
}

// ── View-specific builders ─────────────────────────────────────────────────

export function buildOverviewData(raw: RawData): OverviewData {
  const months = last6Months();
  const leads = raw.contacts.filter((c) => c.tags?.includes('application-link'));

  const leadsOverTime = buildMonthBuckets(
    leads.map((l) => new Date(l.createdAt)),
    months,
  );

  const dealsByStage = raw.stages.map((stage) => {
    const stageDeals = raw.deals.filter((d) => d.stageId === stage.id);
    return {
      name: stage.name,
      count: stageDeals.length,
      value: stageDeals.reduce((s, d) => s + (d.value ?? 0), 0),
      color: stage.color,
    };
  });

  return {
    totalLeads: leads.length,
    totalContacts: raw.contacts.length,
    totalDeals: raw.deals.filter((d) => d.status === 'active').length,
    totalPipelineValue: raw.deals.filter((d) => d.status === 'active').reduce((s, d) => s + (d.value ?? 0), 0),
    leadsOverTime,
    dealsByStage,
  };
}

export function buildLeadsAnalyticsData(raw: RawData): LeadsAnalyticsData {
  const months = last6Months();
  const leads = raw.contacts.filter((c) => c.tags?.includes('application-link'));

  const leadsOverTime = buildMonthBuckets(
    leads.map((l) => new Date(l.createdAt)),
    months,
  );

  const scoredLeads = leads.filter((l) => l.scoringStatus === 'scored' && l.leadScore != null);
  const avgLeadScore =
    scoredLeads.length > 0
      ? scoredLeads.reduce((s, l) => s + (l.leadScore ?? 0), 0) / scoredLeads.length
      : null;

  const leadScoreBuckets = [
    { label: 'Hot', count: leads.filter((l) => l.scoringStatus === 'scored' && l.scoreLabel === 'hot').length },
    { label: 'Warm', count: leads.filter((l) => l.scoringStatus === 'scored' && l.scoreLabel === 'warm').length },
    { label: 'Cold', count: leads.filter((l) => l.scoringStatus === 'scored' && l.scoreLabel === 'cold').length },
    { label: 'Unscored', count: leads.filter((l) => l.scoringStatus !== 'scored' || !l.scoreLabel).length },
  ];

  // Lead state distribution
  const leadStateCounts: Record<string, number> = {};
  for (const l of leads) {
    if (!l.scoreDetails?.leadState) continue;
    const r = l.scoreDetails.leadState;
    const label =
      r === 'high_priority_qualified_renter' ? 'High priority' :
      r === 'qualified_low_urgency' ? 'Qualified, low urgency' :
      r === 'incomplete_application' ? 'Incomplete application' :
      r === 'needs_additional_info' ? 'Needs more info' :
      r === 'likely_unqualified' ? 'Likely unqualified' :
      r;
    leadStateCounts[label] = (leadStateCounts[label] ?? 0) + 1;
  }
  const leadStateDistribution = Object.entries(leadStateCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Risk flags
  const riskFlagCounts: Record<string, number> = {};
  for (const l of leads) {
    for (const flag of l.scoreDetails?.riskFlags ?? []) {
      if (flag) riskFlagCounts[flag] = (riskFlagCounts[flag] ?? 0) + 1;
    }
  }
  const topRiskFlags = Object.entries(riskFlagCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Avg score by month
  const scoreByMonth: Record<string, { total: number; count: number }> = {};
  for (const m of months) scoreByMonth[m] = { total: 0, count: 0 };
  for (const l of scoredLeads) {
    const key = monthKey(new Date(l.createdAt));
    if (key in scoreByMonth) {
      scoreByMonth[key].total += l.leadScore ?? 0;
      scoreByMonth[key].count += 1;
    }
  }
  const avgScoreByMonth = months.map((m) => ({
    month: m,
    avg: scoreByMonth[m].count > 0 ? Math.round(scoreByMonth[m].total / scoreByMonth[m].count) : null,
  }));

  // Qualification: employment
  const leadsWithApp = leads.filter((l) => l.applicationData != null);
  const employmentCounts: Record<string, number> = {};
  for (const l of leadsWithApp) {
    const status = l.applicationData?.employmentStatus ?? '';
    const label =
      status === 'employed' ? 'Employed' :
      status === 'self-employed' ? 'Self-employed' :
      status === 'unemployed' ? 'Unemployed' :
      status === 'retired' ? 'Retired' :
      status === 'student' ? 'Student' :
      'Not provided';
    employmentCounts[label] = (employmentCounts[label] ?? 0) + 1;
  }
  const employmentBreakdown = Object.entries(employmentCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Affordability
  const affordabilityLeads = leadsWithApp.filter(
    (l) => l.applicationData?.monthlyGrossIncome != null && l.applicationData?.monthlyRent != null,
  );
  const affordabilityPasses = affordabilityLeads.filter(
    (l) => Number(l.applicationData!.monthlyGrossIncome ?? 0) >= Number(l.applicationData!.monthlyRent ?? 0) * 3,
  ).length;
  const affordabilityBuckets = affordabilityLeads.length > 0
    ? [
        { label: 'Passes 3x rule', count: affordabilityPasses },
        { label: 'Below 3x rule', count: affordabilityLeads.length - affordabilityPasses },
      ]
    : [];

  // Screening flags
  const screeningFlags = [
    { label: 'Prior evictions', count: leadsWithApp.filter((l) => l.applicationData?.priorEvictions === true).length },
    { label: 'Outstanding balances', count: leadsWithApp.filter((l) => l.applicationData?.outstandingBalances === true).length },
    { label: 'Bankruptcy', count: leadsWithApp.filter((l) => l.applicationData?.bankruptcy === true).length },
    { label: 'Has pets', count: leadsWithApp.filter((l) => l.applicationData?.hasPets === true).length },
    { label: 'Late payments', count: leadsWithApp.filter((l) => l.applicationData?.latePayments === true).length },
    { label: 'Lease violations', count: leadsWithApp.filter((l) => l.applicationData?.leaseViolations === true).length },
  ].filter((f) => f.count > 0);

  // Move-in urgency
  const urgencyBuckets: Record<string, number> = {
    'Overdue': 0, '≤ 30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0, 'Not provided': 0,
  };
  for (const l of leadsWithApp) {
    const date = l.applicationData?.targetMoveInDate;
    if (!date) { urgencyBuckets['Not provided']++; continue; }
    const d = daysUntil(date);
    if (d == null) { urgencyBuckets['Not provided']++; continue; }
    if (d < 0) urgencyBuckets['Overdue']++;
    else if (d <= 30) urgencyBuckets['≤ 30 days']++;
    else if (d <= 60) urgencyBuckets['31-60 days']++;
    else if (d <= 90) urgencyBuckets['61-90 days']++;
    else urgencyBuckets['90+ days']++;
  }
  const moveInUrgency = Object.entries(urgencyBuckets)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));

  // Lead type
  const buyerLeads = leads.filter((l) => l.leadType === 'buyer');
  const rentalLeads = leads.filter((l) => l.leadType === 'rental');
  const buyerBudgetBuckets: Record<string, number> = {
    'Under $200K': 0, '$200K-$400K': 0, '$400K-$600K': 0,
    '$600K-$800K': 0, '$800K-$1M': 0, 'Over $1M': 0,
  };
  for (const l of buyerLeads) {
    const app = l.applicationData;
    const rawBudget = app?.buyerBudget ?? app?.preApprovalAmount ?? app?.monthlyRent;
    const budget = typeof rawBudget === 'string' ? parseFloat(rawBudget.replace(/[^0-9.]/g, '')) : (typeof rawBudget === 'number' ? rawBudget : null);
    if (budget == null || isNaN(budget)) continue;
    if (budget < 200000) buyerBudgetBuckets['Under $200K']++;
    else if (budget < 400000) buyerBudgetBuckets['$200K-$400K']++;
    else if (budget < 600000) buyerBudgetBuckets['$400K-$600K']++;
    else if (budget < 800000) buyerBudgetBuckets['$600K-$800K']++;
    else if (budget < 1000000) buyerBudgetBuckets['$800K-$1M']++;
    else buyerBudgetBuckets['Over $1M']++;
  }
  const buyerBudgetDistribution = Object.entries(buyerBudgetBuckets)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));

  return {
    totalLeads: leads.length,
    avgLeadScore,
    leadsOverTime,
    leadScoreBuckets,
    leadStateDistribution,
    topRiskFlags,
    avgScoreByMonth,
    employmentBreakdown,
    affordabilityBuckets,
    screeningFlags,
    moveInUrgency,
    buyerLeadCount: buyerLeads.length,
    rentalLeadCount: rentalLeads.length,
    buyerBudgetDistribution,
  };
}

export function buildClientsAnalyticsData(raw: RawData): ClientsAnalyticsData {
  const months = last6Months();
  const nonLeadContacts = raw.contacts.filter((c) => !c.tags?.includes('application-link'));
  const leads = raw.contacts.filter((c) => c.tags?.includes('application-link'));

  const contactsOverTime = buildMonthBuckets(
    nonLeadContacts.map((c) => new Date(c.createdAt)),
    months,
  );

  const contactsByStage = [
    { label: 'Qualifying', count: raw.contacts.filter((c) => c.type === 'QUALIFICATION').length },
    { label: 'Tour', count: raw.contacts.filter((c) => c.type === 'TOUR').length },
    { label: 'Applied', count: raw.contacts.filter((c) => c.type === 'APPLICATION').length },
  ];

  const qualCount = raw.contacts.filter((c) => c.type === 'QUALIFICATION').length;
  const tourCount = raw.contacts.filter((c) => c.type === 'TOUR').length;
  const appCount = raw.contacts.filter((c) => c.type === 'APPLICATION').length;

  const contactFunnel = [
    { label: 'Qualifying', count: qualCount, rate: 100 },
    // Each subsequent rate is relative to the top of the funnel (qualCount) so the
    // funnel bars are always decreasing and rates stay ≤ 100%.
    { label: 'Tour', count: tourCount, rate: qualCount > 0 ? Math.min(100, Math.round((tourCount / qualCount) * 100)) : 0 },
    { label: 'Applied', count: appCount, rate: qualCount > 0 ? Math.min(100, Math.round((appCount / qualCount) * 100)) : 0 },
  ];

  // Lead-to-client rate: fraction of leads that advanced to APPLICATION stage
  const leadToClientRate = leads.length > 0 ? Math.min(100, Math.round((appCount / leads.length) * 100)) : 0;

  return {
    totalContacts: raw.contacts.length,
    contactsOverTime,
    contactsByStage,
    contactFunnel,
    leadToClientRate,
    totalLeads: leads.length,
  };
}

export function buildToursAnalyticsData(raw: RawData): ToursAnalyticsData {
  const months = last6Months();
  const allTours = raw.tours;

  const totalTours = allTours.length;
  const completedTours = allTours.filter((t) => t.status === 'completed').length;
  const cancelledTours = allTours.filter((t) => t.status === 'cancelled').length;
  const noShowTours = allTours.filter((t) => t.status === 'no_show').length;
  const scheduledTours = allTours.filter((t) => t.status === 'scheduled' || t.status === 'confirmed').length;
  // Count unique tours that generated at least one deal (not total deals from tours)
  const tourIdsWithDeals = new Set(
    raw.deals.filter((d) => d.sourceTourId != null).map((d) => d.sourceTourId!),
  );
  const toursConvertedToDeals = tourIdsWithDeals.size;
  const tourConversionRate = completedTours > 0 ? Math.min(100, Math.round((toursConvertedToDeals / completedTours) * 100)) : 0;

  // Tours by status — use human-readable labels for known statuses
  const STATUS_LABELS: Record<string, string> = {
    completed: 'Completed',
    scheduled: 'Scheduled',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
  };
  const statusCounts: Record<string, number> = {};
  for (const t of allTours) {
    const s = t.status || 'unknown';
    const label = STATUS_LABELS[s] ?? (s.charAt(0).toUpperCase() + s.slice(1));
    statusCounts[label] = (statusCounts[label] ?? 0) + 1;
  }
  const toursByStatus = Object.entries(statusCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const toursOverTime = buildMonthBuckets(
    allTours.map((t) => new Date(t.createdAt)),
    months,
  );

  return {
    totalTours,
    completedTours,
    cancelledTours,
    noShowTours,
    scheduledTours,
    toursConvertedToDeals,
    tourConversionRate,
    toursByStatus,
    toursOverTime,
  };
}

export function buildPipelineAnalyticsData(raw: RawData): PipelineAnalyticsData {
  const months = last6Months();
  const deals = raw.deals;

  const wonDeals = deals.filter((d) => d.status === 'won').length;
  const lostDeals = deals.filter((d) => d.status === 'lost').length;
  // Win rate = won / (won + lost) — only count decided deals, not active/on_hold
  const decidedDeals = wonDeals + lostDeals;
  const dealWinRate = decidedDeals > 0 ? Math.round((wonDeals / decidedDeals) * 100) : 0;
  // Pipeline value only includes active deals (not won/lost/on_hold)
  const activeDeals = deals.filter((d) => d.status === 'active');
  const totalPipelineValue = activeDeals.reduce((s, d) => s + (d.value ?? 0), 0);
  const avgDealSize = activeDeals.length > 0 ? Math.round(totalPipelineValue / activeDeals.length) : 0;

  const dealsByStage = raw.stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stageId === stage.id);
    return {
      name: stage.name,
      count: stageDeals.length,
      value: stageDeals.reduce((s, d) => s + (d.value ?? 0), 0),
      color: stage.color,
    };
  });

  // Deals by priority
  const priorityCounts: Record<string, number> = {};
  for (const d of deals) {
    const p = d.priority || 'none';
    priorityCounts[p] = (priorityCounts[p] ?? 0) + 1;
  }
  const dealsByPriority = Object.entries(priorityCounts)
    .map(([label, count]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), count }))
    .sort((a, b) => b.count - a.count);

  const dealsOverTime = buildMonthBuckets(
    deals.map((d) => new Date(d.createdAt)),
    months,
  );

  return {
    totalDeals: deals.length,
    activeDeals: activeDeals.length,
    totalPipelineValue,
    dealWinRate,
    wonDeals,
    lostDeals,
    avgDealSize,
    dealsByStage,
    dealsByPriority,
    dealsOverTime,
  };
}
