/**
 * Closing-checklist types, templates, and derivation helpers.
 *
 * Design notes:
 *   - Items are typed via `kind` so we can render icons and seed from templates.
 *     `custom` exists as an escape hatch for user-added rows that don't fit the
 *     canonical flow.
 *   - Due dates are derived from the deal's closeDate via day offsets. When
 *     closeDate is null, items are seeded with dueAt = null and the realtor
 *     can fill dates in later.
 *   - The template is intentionally residential/buyer-side — commercial and
 *     rental flows can be added later. The UI offers an explicit "seed"
 *     action rather than auto-populating on stage change; this keeps the
 *     behaviour transparent.
 */

export type ChecklistKind =
  | 'earnest_money'
  | 'inspection'
  | 'appraisal'
  | 'loan_commitment'
  | 'clear_to_close'
  | 'final_walkthrough'
  | 'closing'
  | 'custom';

export interface DealChecklistItem {
  id: string;
  dealId: string;
  spaceId: string;
  kind: ChecklistKind;
  label: string;
  dueAt: string | null;
  completedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Residential buyer flow. Offsets are *days from the closeDate*, so a negative
 * offset means "before closing". Items that happen early in escrow (earnest
 * money, inspection) are pegged to today when closeDate is too far out — we
 * clamp any dueAt earlier than today so the list isn't born already overdue.
 */
export interface TemplateItem {
  kind: ChecklistKind;
  label: string;
  /** Days relative to closeDate. 0 = closeDate itself. Negative = before close. */
  offsetFromCloseDays: number | null;
  /** If closeDate is null, fall back to this absolute day offset from today. */
  fallbackDaysFromToday: number | null;
}

export const BUYER_RESIDENTIAL_TEMPLATE: TemplateItem[] = [
  { kind: 'earnest_money',     label: 'Earnest money deposited',        offsetFromCloseDays: -35, fallbackDaysFromToday: 3 },
  { kind: 'inspection',        label: 'Inspection period ends',         offsetFromCloseDays: -28, fallbackDaysFromToday: 10 },
  { kind: 'appraisal',         label: 'Appraisal ordered',              offsetFromCloseDays: -24, fallbackDaysFromToday: 14 },
  { kind: 'loan_commitment',   label: 'Loan commitment',                offsetFromCloseDays: -17, fallbackDaysFromToday: 21 },
  { kind: 'clear_to_close',    label: 'Clear to close',                 offsetFromCloseDays: -3,  fallbackDaysFromToday: 28 },
  { kind: 'final_walkthrough', label: 'Final walkthrough',              offsetFromCloseDays: -1,  fallbackDaysFromToday: null },
  { kind: 'closing',           label: 'Closing',                        offsetFromCloseDays: 0,   fallbackDaysFromToday: null },
];

/**
 * Rental flow. Shorter + landlord-centric. `closing` here means move-in /
 * lease start. Custom items cover application processing, screening, lease
 * signing — things that don't fit the buyer kinds cleanly.
 */
export const RENTAL_TEMPLATE: TemplateItem[] = [
  { kind: 'custom',            label: 'Application submitted',          offsetFromCloseDays: -14, fallbackDaysFromToday: 1 },
  { kind: 'custom',            label: 'Screening + background complete', offsetFromCloseDays: -10, fallbackDaysFromToday: 3 },
  { kind: 'custom',            label: 'Lease drafted',                  offsetFromCloseDays: -7,  fallbackDaysFromToday: 5 },
  { kind: 'custom',            label: 'Lease signed',                   offsetFromCloseDays: -3,  fallbackDaysFromToday: 7 },
  { kind: 'earnest_money',     label: 'Security deposit + first month received', offsetFromCloseDays: -2, fallbackDaysFromToday: 8 },
  { kind: 'final_walkthrough', label: 'Move-in inspection',             offsetFromCloseDays: -1,  fallbackDaysFromToday: null },
  { kind: 'closing',           label: 'Move-in / keys handed over',     offsetFromCloseDays: 0,   fallbackDaysFromToday: null },
];

export type TemplateId = 'buyer_residential' | 'rental_residential';

export const TEMPLATES: Record<TemplateId, { label: string; description: string; items: TemplateItem[] }> = {
  buyer_residential: {
    label: 'Buyer · residential',
    description: 'Earnest money → inspection → appraisal → loan → walkthrough → close.',
    items: BUYER_RESIDENTIAL_TEMPLATE,
  },
  rental_residential: {
    label: 'Rental',
    description: 'Application → screening → lease → deposit → move-in.',
    items: RENTAL_TEMPLATE,
  },
};

function midnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Given a template and an optional closeDate, materialise due dates. Returns
 * an ordered array ready to insert into `DealChecklistItem`.
 */
export function materializeTemplate(
  template: TemplateItem[],
  closeDate: Date | string | null,
): Array<{ kind: ChecklistKind; label: string; dueAt: string | null; position: number }> {
  const today = midnight(new Date());
  const close = closeDate ? midnight(new Date(closeDate)) : null;
  const closeValid = close && !isNaN(close.getTime());

  return template.map((t, i) => {
    let due: Date | null = null;
    if (closeValid && t.offsetFromCloseDays !== null) {
      const d = new Date(close);
      d.setDate(d.getDate() + t.offsetFromCloseDays);
      // Clamp so we don't seed items that are already overdue.
      due = d.getTime() < today.getTime() ? today : d;
    } else if (t.fallbackDaysFromToday !== null) {
      const d = new Date(today);
      d.setDate(d.getDate() + t.fallbackDaysFromToday);
      due = d;
    }
    return {
      kind: t.kind,
      label: t.label,
      dueAt: due ? due.toISOString() : null,
      position: i,
    };
  });
}

/**
 * Summary shown as a chip on the kanban card: "3/7 · next: Inspection Thu".
 */
export function summarizeChecklist(items: Pick<DealChecklistItem, 'completedAt' | 'dueAt' | 'label'>[]): {
  total: number;
  complete: number;
  nextLabel: string | null;
  nextDueAt: Date | null;
  anyOverdue: boolean;
} | null {
  if (items.length === 0) return null;

  const total = items.length;
  const complete = items.filter((i) => i.completedAt).length;

  const today = midnight(new Date());
  let anyOverdue = false;
  let next: { label: string; dueAt: Date | null } | null = null;

  // "Next" = earliest open item, preferring those with a dueAt.
  const open = items.filter((i) => !i.completedAt);
  const datedOpen = open
    .filter((i) => i.dueAt)
    .map((i) => ({ label: i.label, dueAt: new Date(i.dueAt as string) }))
    .filter((i) => !isNaN(i.dueAt.getTime()))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  if (datedOpen.length > 0) {
    next = datedOpen[0];
    anyOverdue = datedOpen.some((i) => i.dueAt.getTime() < today.getTime());
  } else if (open.length > 0) {
    next = { label: open[0].label, dueAt: null };
  }

  return {
    total,
    complete,
    nextLabel: next?.label ?? null,
    nextDueAt: next?.dueAt ?? null,
    anyOverdue,
  };
}
