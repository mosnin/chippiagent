#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(repoRoot).filter((f) => /\.(ts|tsx|js|mjs|md)$/.test(f));
const rel = (f) => f.replace(`${repoRoot}/`, '');
const read = (f) => readFileSync(f, 'utf8');
const errors = [];

function expectContains(file, regex, message) {
  const body = read(file);
  if (!regex.test(body)) errors.push(`${rel(file)}: ${message}`);
}

function expectNotContains(file, regex, message) {
  const body = read(file);
  if (regex.test(body)) errors.push(`${rel(file)}: ${message}`);
}

// 1) Canonical onboarding helper must define onboarding from user.onboard.
const onboardingHelper = join(repoRoot, 'lib/onboarding.ts');
expectContains(onboardingHelper, /isOnboarded:\s*!!user\?\.onboard/, 'onboarding helper must define isOnboarded from user.onboard');
// Supabase schema (not Prisma) is the source of truth — check the SQL file instead.
expectContains(join(repoRoot, 'supabase/schema.sql'), /onboard\s+boolean/, 'User table must include onboard boolean column');

// 2) Onboarding API must use shared helper.
expectContains(join(repoRoot, 'app/api/onboarding/route.ts'), /getOnboardingStatus/, 'must use getOnboardingStatus');
// Dashboard and layout use ensureOnboardingBackfill (which depends on the same module)
expectContains(join(repoRoot, 'app/dashboard/page.tsx'), /ensureOnboardingBackfill/, 'must use ensureOnboardingBackfill');
expectContains(join(repoRoot, 'app/s/[slug]/layout.tsx'), /ensureOnboardingBackfill/, 'must use ensureOnboardingBackfill');

// 3) Critical runtime files must not contain subdomain naming.
for (const file of files) {
  const r = rel(file);
  if (!r.startsWith('app/') && !r.startsWith('components/') && !r.startsWith('lib/')) continue;
  if (/\bsubdomain\b/i.test(read(file))) {
    errors.push(`${r}: contains forbidden subdomain naming in runtime path`);
  }
}

// 4) No host-based tenant identity inference in runtime paths.
for (const file of files) {
  const r = rel(file);
  if (!r.startsWith('app/') && !r.startsWith('components/') && !r.startsWith('lib/')) continue;
  const body = read(file);
  if (/window\.location\.hostname|x-forwarded-host|req\.headers\.get\(['"]host['"]\)/i.test(body)) {
    errors.push(`${r}: contains host-based identity logic`);
  }
}

// 5) Product routing must use slug params.
expectContains(join(repoRoot, 'app/apply/[slug]/page.tsx'), /params:\s*Promise<\{\s*slug:\s*string\s*\}>/, 'public apply route must use slug param');
expectContains(join(repoRoot, 'app/s/[slug]/layout.tsx'), /params:\s*Promise<\{\s*slug:\s*string\s*\}>/, 'workspace route must use slug param');

// 6) Intake links must use canonical helper.
for (const requiredFile of [
  'app/s/[slug]/profile/page.tsx',
  'app/s/[slug]/page.tsx',
  'app/s/[slug]/configure/configure-account-form.tsx',
]) {
  expectContains(join(repoRoot, requiredFile), /buildIntakeUrl|buildIntakePath/, 'must use canonical intake helper(s)');
}

// 7) Public intake form has exactly one submission endpoint.
const formFile = join(repoRoot, 'app/apply/[slug]/application-form.tsx');
expectContains(formFile, /fetch\('\/api\/public\/apply'/, 'form should submit to /api/public/apply');
expectNotContains(formFile, /fetch\('\/api\/(?!public\/apply)/, 'form should not submit to alternate API routes');

// 8) Public apply API must validate schema and perform idempotency protection.
const applyApi = join(repoRoot, 'app/api/public/apply/route.ts');
expectContains(applyApi, /publicApplicationSchema\.safeParse/, 'must validate with shared schema');
expectContains(applyApi, /idempotencyKey/, 'must create idempotency key');
expectContains(applyApi, /redis\.set\(idempotencyKey/, 'must attempt distributed idempotency lock');
expectContains(applyApi, /duplicateCutoff/, 'must include DB duplicate fallback');

if (errors.length) {
  console.error('Regression checks failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Routing/intake regression checks passed.');
