export type DealDocumentKind =
  | 'offer'
  | 'counter_offer'
  | 'purchase_agreement'
  | 'inspection_report'
  | 'appraisal'
  | 'loan_estimate'
  | 'closing_disclosure'
  | 'title_commitment'
  | 'listing_agreement'
  | 'seller_disclosure'
  | 'comparative_market_analysis'
  | 'net_sheet'
  | 'lease_agreement'
  | 'rental_application'
  | 'photo'
  | 'other';

export interface DealDocument {
  id: string;
  dealId: string;
  spaceId: string;
  kind: DealDocumentKind;
  label: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedById: string | null;
  createdAt: string;
}

export const DEAL_DOCUMENT_KINDS: { value: DealDocumentKind; label: string }[] = [
  { value: 'offer',                       label: 'Offer' },
  { value: 'counter_offer',               label: 'Counter offer' },
  { value: 'purchase_agreement',          label: 'Purchase agreement' },
  { value: 'inspection_report',           label: 'Inspection report' },
  { value: 'appraisal',                   label: 'Appraisal' },
  { value: 'loan_estimate',               label: 'Loan estimate' },
  { value: 'closing_disclosure',          label: 'Closing disclosure' },
  { value: 'title_commitment',            label: 'Title commitment' },
  { value: 'listing_agreement',           label: 'Listing agreement' },
  { value: 'seller_disclosure',           label: 'Seller disclosure' },
  { value: 'comparative_market_analysis', label: 'Comparative market analysis' },
  { value: 'net_sheet',                   label: 'Net sheet' },
  { value: 'lease_agreement',             label: 'Lease agreement' },
  { value: 'rental_application',          label: 'Rental application' },
  { value: 'photo',                       label: 'Photo' },
  { value: 'other',                       label: 'Other' },
];

/** Returns the default document kind to pre-select for a given pipeline type. */
export function defaultDocumentKind(pipelineType: string | null | undefined): DealDocumentKind {
  if (pipelineType === 'seller') return 'listing_agreement';
  if (pipelineType === 'rental') return 'lease_agreement';
  return 'offer';
}

/** Returns the document kinds most relevant to a pipeline type, ordered for display. */
export function documentKindsForPipeline(pipelineType: string | null | undefined): DealDocumentKind[] {
  if (pipelineType === 'seller') {
    return ['listing_agreement', 'seller_disclosure', 'comparative_market_analysis', 'net_sheet', 'offer', 'counter_offer', 'purchase_agreement', 'inspection_report', 'appraisal', 'closing_disclosure', 'title_commitment', 'photo', 'other'];
  }
  if (pipelineType === 'rental') {
    return ['lease_agreement', 'rental_application', 'photo', 'other'];
  }
  return ['offer', 'counter_offer', 'purchase_agreement', 'inspection_report', 'appraisal', 'loan_estimate', 'closing_disclosure', 'title_commitment', 'photo', 'other'];
}

const VALID = new Set(DEAL_DOCUMENT_KINDS.map((k) => k.value));

export function isValidDocumentKind(raw: unknown): raw is DealDocumentKind {
  return typeof raw === 'string' && VALID.has(raw as DealDocumentKind);
}

export function documentKindLabel(kind: DealDocumentKind): string {
  return DEAL_DOCUMENT_KINDS.find((k) => k.value === kind)?.label ?? 'Other';
}

/** 1.2 MB → "1.2 MB". Used inline on the doc row. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toFixed(n >= 100 || u === 0 ? 0 : 1)} ${units[u]}`;
}
