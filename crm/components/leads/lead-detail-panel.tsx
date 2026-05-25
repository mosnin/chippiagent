'use client';

import { useEffect } from 'react';
import {
  X,
  UserCheck,
  Phone,
  Mail,
  DollarSign,
  Calendar,
  Briefcase,
  Users,
  PawPrint,
  MapPin,
  Home,
  BedDouble,
  Bath,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Contact, ApplicationData, LeadScoreDetails } from '@/lib/types';
import {
  formatMoney,
  formatFollowUpDate,
  toDateInputValue,
  getInitials,
  timeAgo,
} from '@/lib/formatting';
import { LEAD_TIERS, type TierKey } from '@/lib/constants';

function getTierKey(lead: Contact): TierKey {
  if (lead.scoringStatus !== 'scored' || !lead.scoreLabel) return 'unscored';
  if (lead.scoreLabel === 'hot') return 'hot';
  if (lead.scoreLabel === 'warm') return 'warm';
  if (lead.scoreLabel === 'cold') return 'cold';
  return 'unscored';
}

function DetailChip({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ size: number; className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 bg-muted text-muted-foreground">
      <Icon size={11} />
      {label}
    </span>
  );
}

interface LeadDetailPanelProps {
  lead: Contact | null;
  isNew: boolean;
  onClose: () => void;
  onConvert: (lead: Contact) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
}

export function LeadDetailPanel({
  lead,
  isNew,
  onClose,
  onConvert,
  onPatch,
}: LeadDetailPanelProps) {
  useEffect(() => {
    if (!lead) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [lead, onClose]);

  if (!lead) return null;

  const app = lead.applicationData as ApplicationData | null;
  const details = lead.scoreDetails as LeadScoreDetails | null;
  const tierKey = getTierKey(lead);
  const tier = LEAD_TIERS[tierKey];
  const TierIcon = tier.icon;
  const score = lead.leadScore != null ? Math.round(lead.leadScore) : null;

  const rawBudget = app?.monthlyRent ?? lead.budget;
  const budgetDisplay =
    typeof rawBudget === 'string'
      ? rawBudget
      : rawBudget != null
      ? `${formatMoney(rawBudget)}/mo`
      : null;
  const incomeDisplay =
    typeof app?.monthlyGrossIncome === 'string'
      ? app.monthlyGrossIncome
      : app?.monthlyGrossIncome != null
      ? `${formatMoney(app.monthlyGrossIncome)}/mo income`
      : null;

  const riskFlags = (details?.riskFlags ?? []).filter((f) => f !== 'none');

  const intentLabel = app?.leaseTermPreference;
  const intentBadge =
    intentLabel === 'Yes, ready now'
      ? { text: 'Ready now', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' }
      : intentLabel === 'Maybe'
      ? { text: 'Maybe', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' }
      : intentLabel === 'Just exploring'
      ? { text: 'Exploring', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300' }
      : null;

  const hasApplicationData =
    budgetDisplay ||
    app?.preApprovalStatus ||
    app?.preApprovalAmount ||
    app?.propertyType ||
    app?.bedrooms ||
    app?.bathrooms ||
    app?.employmentStatus ||
    incomeDisplay ||
    app?.targetMoveInDate ||
    app?.numberOfOccupants != null ||
    app?.adultsOnApplication != null ||
    app?.hasPets ||
    app?.propertyAddress ||
    lead.preferences;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — bottom sheet on mobile, right rail on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Lead — ${lead.name}`}
        className="fixed bottom-0 left-0 right-0 sm:left-auto sm:top-0 sm:bottom-0 sm:right-0 sm:w-[480px] max-h-[90dvh] sm:max-h-full bg-card border-t sm:border-t-0 sm:border-l border-border rounded-t-2xl sm:rounded-none z-50 flex flex-col"
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-3 sm:pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground flex-shrink-0 mt-0.5">
            {getInitials(lead.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 leading-none mb-1">
              Lead
            </p>
            <p className="text-base font-bold text-foreground leading-tight truncate">
              {lead.name}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5',
                  tier.pill,
                )}
              >
                <TierIcon size={9} />
                {tier.label}
              </span>
              {isNew && (
                <span className="text-[10px] font-bold bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 rounded-md px-1.5 py-0.5">
                  NEW
                </span>
              )}
              {intentBadge && (
                <span className={cn('text-[10px] font-semibold rounded-md px-1.5 py-0.5', intentBadge.cls)}>
                  {intentBadge.text}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {lead.leadType === 'buyer' ? 'Buyer' : lead.leadType === 'seller' ? 'Seller' : 'Rental'}
                {' · '}
                {timeAgo(new Date(lead.createdAt))}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0 mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Contact ───────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">
              Contact
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                >
                  <Phone size={13} />
                  {lead.phone}
                </a>
              )}
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors truncate max-w-full"
                >
                  <Mail size={13} />
                  <span className="truncate">{lead.email}</span>
                </a>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                Submitted {timeAgo(new Date(lead.createdAt))}
              </span>
              {lead.sourceLabel && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="flex items-center gap-1">
                    <Tag size={10} />
                    {lead.sourceLabel === 'intake-form'
                      ? 'Intake form'
                      : lead.sourceLabel === 'tour-booking'
                      ? 'Tour booking'
                      : lead.sourceLabel}
                  </span>
                </>
              )}
              {lead.lastContactedAt && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    Contacted {timeAgo(new Date(lead.lastContactedAt))}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ── AI Score ──────────────────────────────────────────────────── */}
          {(lead.scoringStatus === 'scored' || lead.scoringStatus === 'pending') && (
            <div className="px-5 py-4 border-b border-border">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">
                AI Score
              </p>
              {lead.scoringStatus === 'pending' ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin flex-shrink-0" />
                  Analyzing this lead...
                </span>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={cn('text-xs font-semibold flex items-center gap-1 flex-shrink-0', tier.text)}>
                      <TierIcon size={11} />
                      {tier.label}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', tier.scoreBg)}
                        style={{ width: `${score ?? 0}%` }}
                      />
                    </div>
                    <span className={cn('text-sm font-bold tabular-nums flex-shrink-0', tier.text)}>
                      {score ?? '—'}
                    </span>
                  </div>
                  {lead.scoreSummary && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {lead.scoreSummary}
                    </p>
                  )}
                  {details?.explanationTags && details.explanationTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {details.explanationTags.map((tag) => (
                        <span
                          key={tag}
                          className={cn(
                            'inline-flex items-center text-[10px] font-medium rounded-full px-2 py-0.5',
                            tier.pill,
                          )}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {riskFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {riskFlags.map((flag) => (
                        <span
                          key={flag}
                          className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 bg-destructive/10 text-destructive"
                        >
                          <AlertTriangle size={9} />
                          {flag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Application data ──────────────────────────────────────────── */}
          {hasApplicationData && (
            <div className="px-5 py-4 border-b border-border">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">
                Application
              </p>
              <div className="flex flex-wrap gap-1.5">
                {budgetDisplay && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1.5 bg-secondary text-foreground">
                    <DollarSign size={11} />
                    {budgetDisplay}
                  </span>
                )}
                {(lead.leadType === 'buyer' || lead.leadType === 'seller') ? (
                  <>
                    {app?.preApprovalStatus && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5',
                          app.preApprovalStatus === 'yes' ||
                          app.preApprovalStatus === 'Pre-Approved' ||
                          app.preApprovalStatus === 'Yes'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : app.preApprovalStatus === 'not-yet' ||
                              app.preApprovalStatus === 'Not Yet' ||
                              app.preApprovalStatus === 'In Progress'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
                        )}
                      >
                        <ShieldCheck size={11} />
                        {app.preApprovalStatus === 'yes'
                          ? 'Pre-Approved'
                          : app.preApprovalStatus === 'no'
                          ? 'No Pre-Approval'
                          : app.preApprovalStatus === 'not-yet'
                          ? 'Not Yet'
                          : app.preApprovalStatus}
                      </span>
                    )}
                    {app?.preApprovalAmount && (
                      <DetailChip icon={DollarSign} label={`Approved: ${app.preApprovalAmount}`} />
                    )}
                    {app?.propertyType && <DetailChip icon={Home} label={app.propertyType} />}
                    {app?.bedrooms && <DetailChip icon={BedDouble} label={`${app.bedrooms} bed`} />}
                    {app?.bathrooms && <DetailChip icon={Bath} label={`${app.bathrooms} bath`} />}
                    {app?.employmentStatus && (
                      <DetailChip icon={Briefcase} label={app.employmentStatus} />
                    )}
                    {incomeDisplay && <DetailChip icon={DollarSign} label={incomeDisplay} />}
                  </>
                ) : (
                  <>
                    {app?.employmentStatus && (
                      <DetailChip icon={Briefcase} label={app.employmentStatus} />
                    )}
                    {incomeDisplay && <DetailChip icon={DollarSign} label={incomeDisplay} />}
                    {app?.targetMoveInDate && (
                      <DetailChip icon={Calendar} label={app.targetMoveInDate} />
                    )}
                    {app?.numberOfOccupants != null && (
                      <DetailChip
                        icon={Users}
                        label={`${app.numberOfOccupants} occupant${app.numberOfOccupants !== 1 ? 's' : ''}`}
                      />
                    )}
                    {app?.numberOfOccupants == null && app?.adultsOnApplication != null && (
                      <DetailChip
                        icon={Users}
                        label={`${app.adultsOnApplication} adult${app.adultsOnApplication !== 1 ? 's' : ''}${
                          (app.childrenOrDependents ?? 0) > 0
                            ? ` · ${app.childrenOrDependents} child${app.childrenOrDependents !== 1 ? 'ren' : ''}`
                            : ''
                        }`}
                      />
                    )}
                    {app?.hasPets && (
                      <DetailChip icon={PawPrint} label={app.petDetails ?? 'Has pets'} />
                    )}
                  </>
                )}
                {(app?.propertyAddress || lead.preferences) && (
                  <DetailChip
                    icon={MapPin}
                    label={app?.propertyAddress ?? lead.preferences ?? ''}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Recommended action ────────────────────────────────────────── */}
          {details?.recommendedNextAction && (
            <div className="px-5 py-4 border-b border-border">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2">
                Recommended action
              </p>
              <p className="text-sm text-foreground flex items-start gap-2 leading-relaxed">
                <ArrowRight size={14} className="flex-shrink-0 mt-0.5 text-muted-foreground" />
                {details.recommendedNextAction}
              </p>
            </div>
          )}

          {/* ── Triage ────────────────────────────────────────────────────── */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">
              Triage
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer group/fu">
                <CalendarDays size={14} className="text-muted-foreground flex-shrink-0" />
                <span
                  className={cn(
                    'font-medium',
                    lead.followUpAt
                      ? new Date(lead.followUpAt) < new Date()
                        ? 'text-destructive'
                        : 'text-foreground'
                      : 'text-muted-foreground group-hover/fu:text-foreground transition-colors',
                  )}
                >
                  {lead.followUpAt
                    ? formatFollowUpDate(lead.followUpAt)
                    : 'Set follow-up date'}
                </span>
                <input
                  type="date"
                  className="sr-only"
                  value={toDateInputValue(lead.followUpAt)}
                  onChange={(e) =>
                    onPatch(lead.id, { followUpAt: e.target.value || null })
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  onPatch(lead.id, {
                    lastContactedAt: lead.lastContactedAt
                      ? null
                      : new Date().toISOString(),
                  })
                }
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 transition-colors',
                  lead.lastContactedAt
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                    : 'text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80',
                )}
              >
                <CheckCircle2 size={14} />
                {lead.lastContactedAt ? 'Contacted' : 'Mark contacted'}
              </button>
            </div>
          </div>

          <div className="h-2" />
        </div>

        {/* Convert CTA — sticky footer */}
        <div className="flex-shrink-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border bg-card">
          <button
            type="button"
            onClick={() => {
              onClose();
              onConvert(lead);
            }}
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-3 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <UserCheck size={15} />
            Convert to client
            <ArrowRight size={13} />
          </button>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Moves this lead into your Clients pipeline
          </p>
        </div>
      </div>
    </>
  );
}
