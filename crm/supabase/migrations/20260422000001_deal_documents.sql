-- Phase 5 of the deals redesign: per-deal document library.
--
-- Before this, there was no place to store the PDFs that actually close a
-- deal — offer, counter, inspection report, appraisal, loan estimate,
-- closing disclosure. Realtors either kept them in email or a separate
-- folder, which means they weren't visible alongside the rest of the deal.
--
-- Storage bucket `deal-documents` is **private** — access happens via
-- short-lived signed URLs from the server, gated by space ownership.

CREATE TABLE IF NOT EXISTS "DealDocument" (
  id             TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "dealId"       TEXT         NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "spaceId"      TEXT         NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  kind           TEXT         NOT NULL,
  label          TEXT         NOT NULL,       -- display label (often the original filename)
  "storagePath"  TEXT         NOT NULL,       -- path within the 'deal-documents' bucket
  "contentType"  TEXT,
  "sizeBytes"    BIGINT,
  "uploadedById" TEXT,                          -- Clerk userId of the uploader; nullable in case of system-uploaded
  "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "DealDocument_kind_check" CHECK (kind IN (
    'offer',
    'counter_offer',
    'purchase_agreement',
    'inspection_report',
    'appraisal',
    'loan_estimate',
    'closing_disclosure',
    'title_commitment',
    'photo',
    'other'
  ))
);

CREATE INDEX IF NOT EXISTS idx_deal_document_deal
  ON "DealDocument" ("dealId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_deal_document_space
  ON "DealDocument" ("spaceId");

ALTER TABLE "DealDocument" ENABLE ROW LEVEL SECURITY;
