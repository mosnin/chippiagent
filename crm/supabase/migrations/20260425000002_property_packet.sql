-- Phase 11 of the deals redesign: property listing-packet share links.
--
-- Realtors constantly send buyers a bundle: "here's the property + HOA docs
-- + inspection report + disclosures". Today that's a chain of email
-- attachments. A packet is a tokenised public URL that renders the property
-- and a curated set of documents — viewable without login.
--
-- Design:
--   * Packet is scoped to a Property (one property per packet).
--   * It carries an explicit `includeDocumentIds` array of DealDocument ids
--     so the realtor curates what's shared — no accidental leak of a draft
--     offer on the same property.
--   * `expiresAt` is optional but a soft default is set on insert by the
--     API (7 days). Past-expiry tokens return 410.
--   * `viewCount` increments server-side when the public page is viewed so
--     the realtor can see whether anyone looked.

CREATE TABLE IF NOT EXISTS "PropertyPacket" (
  id            TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"     TEXT         NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "propertyId"  TEXT         NOT NULL REFERENCES "Property"(id) ON DELETE CASCADE,
  name          TEXT         NOT NULL,
  token         TEXT         NOT NULL UNIQUE,
  "includeDocumentIds" JSONB NOT NULL DEFAULT '[]'::jsonb,  -- DealDocument ids
  "expiresAt"   TIMESTAMPTZ,
  "viewCount"   INTEGER      NOT NULL DEFAULT 0,
  "lastViewedAt" TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "revokedAt"   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_property_packet_space
  ON "PropertyPacket" ("spaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_property_packet_property
  ON "PropertyPacket" ("propertyId");

ALTER TABLE "PropertyPacket" ENABLE ROW LEVEL SECURITY;
