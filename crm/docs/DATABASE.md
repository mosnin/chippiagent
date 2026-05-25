# Database

> Quick reference for the Supabase schema + migration workflow.
> Complements [ENVIRONMENT.md](../ENVIRONMENT.md) (env setup) and the
> per-feature specs ([docs/AI_AGENT_SPEC.md](AI_AGENT_SPEC.md),
> [docs/BROKERAGE_SPEC.md](BROKERAGE_SPEC.md)) which explain WHAT tables
> exist and WHY.

## Stack

- **Supabase** (hosted Postgres + pgvector + auth we don't use —
  authentication is Clerk).
- **Client:** `@supabase/supabase-js` (`^2.99.1`, see
  [`package.json`](../package.json) line ~37) via
  [`lib/supabase.ts`](../lib/supabase.ts) using the **service role key**
  server-side (bypasses RLS by design — see
  [SECURITY.md](../SECURITY.md) on the defence-in-depth model).
  `lib/supabase.ts` is lazy-initialised and throws if
  `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are missing.
- **No ORM** — raw SQL migrations + TypeScript row casts at call sites.
- Prisma used to be the ORM; fully removed (see
  [docs/AUTH_FLOW.md](AUTH_FLOW.md) §"Historical: the Prisma
  `@map('subdomain')` bug" and
  [docs/slug-rollout-checklist.md](slug-rollout-checklist.md) for the
  incident that triggered the removal). **Do NOT reintroduce Prisma.**

## Layout of `supabase/`

```
supabase/
  schema.sql      # Single-file source-of-truth for the current shape.
                  # Idempotent — safe to re-run.
  setup.sql       # Complete bootstrap for a fresh Supabase project.
                  # Header comment: "run this once in Supabase SQL
                  # Editor" — there is no CLI bootstrap command today.
  migrations/     # 72 timestamped *.sql files, append-only forward migrations.
```

## Migration workflow

### Naming

`supabase/migrations/YYYYMMDDHHMMSS_kebab_case_description.sql`.
Examples from the actual tree:

- `20260515000000_routing_rules_hardening.sql`
- `20260511000000_brokerage_templates.sql`
- `20260314000000_rls_policies.sql`

Timestamp ensures lexicographic ordering. Pick `HHMMSS = 000000` unless
you're interleaving migrations on the same day (the existing tree uses
`000000`–`000004` when multiple land on the same date). One older file
(`003_tours_applications_pro.sql`) pre-dates the timestamp convention —
don't mimic it.

### Authoring

- Use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS` everywhere. Migrations MUST be
  **idempotent** — they can be re-pasted without breaking.
- Prefer `CHECK` constraints for enum-ish text columns over a trigger
  (see `20260511000000_brokerage_templates.sql` line 31 for the
  canonical pattern:
  `CHECK (category IN ('follow-up', 'intro', 'closing', 'tour-invite'))`).
- Reference [`supabase/schema.sql`](../supabase/schema.sql) for existing
  table shape when extending.
- Use `plpgsql` `DO $$ ... $$` blocks for one-shot data migrations —
  guard with `WHERE NOT EXISTS` so a replay is a no-op. See
  [`supabase/migrations/20260511000000_brokerage_templates.sql`](../supabase/migrations/20260511000000_brokerage_templates.sql)
  for a thorough example (extracts legacy JSON blobs into real rows,
  skips bad inputs with `RAISE NOTICE` instead of aborting, enforces
  `CHECK` constraints manually before the `INSERT`).
- For dropping auto-named constraints (e.g. FKs), look the name up in
  `pg_constraint` inside a `DO` block rather than hard-coding. Pattern
  in
  [`supabase/migrations/20260515000000_routing_rules_hardening.sql`](../supabase/migrations/20260515000000_routing_rules_hardening.sql)
  lines 39–60.
- Always end with a header comment block explaining WHY the migration
  exists. Consistency with the existing tree matters — reviewers rely
  on it.

### Applying

There is **no migrate CLI wired into `package.json`**. The only db-
adjacent scripts are the contract tests
(`pnpm test:contract` → `node --test scripts/*.test.mjs`); see
[`package.json`](../package.json) `scripts` block (lines 3–11). Neither
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) nor
[`.github/workflows/deploy-agent.yml`](../.github/workflows/deploy-agent.yml)
runs migrations.

Current process is manual, paste-into-SQL-Editor:

1. Open the Supabase dashboard → SQL Editor → New query.
2. Paste the full contents of the migration file.
3. Run. Confirm the green "Success" banner.
4. Commit the file in the same PR as the code that depends on it.
5. Repeat on every environment (local project → staging project →
   prod project). Migrations are replayable so ordering mistakes are
   recoverable by re-running the full directory in timestamp order.

[README.md](../README.md) (line 118) and
[ENVIRONMENT.md](../ENVIRONMENT.md) §7 both document this manual SQL-
Editor flow for the initial `schema.sql` bootstrap; per-migration
application follows the same pattern.

> TODO: if/when a CI-driven `supabase db push` or custom runner script
> gets added, replace this section with the automated steps.

### Rolling back

**There is no automated rollback.** The convention is to write a
follow-up forward migration rather than DROP-and-retry. If a migration
is broken in flight:

- If it hasn't been applied in prod yet: fix the file in-place,
  re-paste. (Because every DDL uses `IF NOT EXISTS` / `IF EXISTS`, the
  partial state from the first attempt won't block the retry.)
- If it's already in prod: ship a new-timestamped corrective migration
  (e.g. `..._fix_routing_rules_fk.sql`). Do not rewrite history.

## Row Level Security (RLS)

Most tables have **RLS enabled with no policies** — the API uses the
service-role key which bypasses RLS entirely, and anon/authenticated
direct PostgREST access is denied. That is the defence-in-depth model
(verbatim rationale in
[`20260515000000_routing_rules_hardening.sql`](../supabase/migrations/20260515000000_routing_rules_hardening.sql)
lines 6–11).

Tables with actual `CREATE POLICY` rows — search surfaces three
migrations:

- `20260314000000_rls_policies.sql`
- `20260330000001_realtime_replication.sql`
- `20260409_fix_realtime_rls.sql`

Re-run
`grep -l "CREATE POLICY" supabase/migrations/*.sql`
to keep this list current.

## Vector embeddings

Supabase pgvector is used for embedding storage — the
`DocumentEmbedding` table is accessed via
[`lib/zilliz.ts`](../lib/zilliz.ts) (historical name from when Zilliz
was briefly the provider; it is a pgvector wrapper, **NOT**
Zilliz/Milvus). The `match_documents` RPC and HNSW index are created
in [`supabase/schema.sql`](../supabase/schema.sql); see
[ENVIRONMENT.md](../ENVIRONMENT.md) §7 for the enable-extension step and
[ARCHITECTURE.md](../ARCHITECTURE.md) for the broader RAG pipeline.

## Connecting locally

Env vars required by [`lib/supabase.ts`](../lib/supabase.ts):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (also in
  [`.env.example`](../.env.example) line 3; primarily for any future
  client-side usage)

See [ENVIRONMENT.md](../ENVIRONMENT.md) §1 for the full variable table
(criticality, failure symptoms, which file reads each one). Do not
duplicate it here.

The Supabase CLI is **not** currently used in this repo (no
`supabase/config.toml`, no `supabase start` in scripts). If you want
a local Postgres, point `NEXT_PUBLIC_SUPABASE_URL` at a disposable
staging Supabase project instead.

> TODO: if the team adopts the Supabase CLI for local-first dev, add
> the `supabase link` / `supabase db reset` flow here.

## Common operations

| Task | How |
|---|---|
| Add a column | New migration with `ADD COLUMN IF NOT EXISTS` |
| Add a constraint | New migration; prefer `CHECK` over trigger |
| Rename a column | **DO NOT.** Add new column, backfill, switch code, drop old in a later migration once no code references it |
| Backfill data | `DO $$ ... $$` block with `WHERE NOT EXISTS` guard; log skipped rows via `RAISE NOTICE` (pattern: `20260511000000_brokerage_templates.sql`) |
| Drop an auto-named FK | Look up `pg_constraint.conname` inside a `DO` block, then `EXECUTE format(...)` (pattern: `20260515000000_routing_rules_hardening.sql`) |
| Drop a table | New migration with `DROP TABLE IF EXISTS`; typically after a grace period + audit of every `SELECT` |
| Enable RLS on a new table | `ALTER TABLE "Foo" ENABLE ROW LEVEL SECURITY;` with no policies — defence-in-depth, matches the rest of the brokerage tables |

## Testing migrations

There is **no local Supabase setup** in this repo (no `supabase start`,
no Dockerised Postgres). Current practice:

1. Dry-run by pasting into a disposable staging Supabase project's SQL
   Editor; confirm it succeeds.
2. Re-run the same SQL a second time to prove idempotency — if the
   second run errors, the migration is not safe to replay and must be
   fixed before it lands.
3. For data migrations, spot-check row counts before and after, and
   watch the SQL Editor output for `NOTICE` lines indicating skipped
   rows.
4. Only then apply to prod.

> TODO: if a throwaway-container local Postgres harness gets added
> (e.g. `docker compose up postgres` + replay all migrations), document
> the command here.
