#!/usr/bin/env node
/**
 * Minimal runtime smoke checks for slug-based routing + public intake pipeline.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 SLUG=my-workspace node scripts/smoke-slug-flow.mjs
 *
 * Optional:
 *   SMOKE_SUBMIT=1 PHONE=+15551234567 node scripts/smoke-slug-flow.mjs
 */

const base = process.env.BASE_URL || 'http://localhost:3000';
const slug = process.env.SLUG;
const smokeSubmit = process.env.SMOKE_SUBMIT === '1';

if (!slug) {
  console.error('Missing required env var: SLUG');
  process.exit(1);
}

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`❌ ${name}`);
  }
}

function expectStatus(actual, allowed, context) {
  if (!allowed.includes(actual)) {
    throw new Error(`${context} expected ${allowed.join(' or ')}, got ${actual}`);
  }
}

await check('apply page responds for slug route', async () => {
  const res = await fetch(`${base}/apply/${slug}`);
  // 200 when slug exists, 404 when slug doesn't exist.
  expectStatus(res.status, [200, 404], 'GET /apply/:slug');
});

await check('malformed public apply payload is rejected', async () => {
  const res = await fetch(`${base}/api/public/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  expectStatus(res.status, [400], 'POST /api/public/apply malformed payload');
});

if (smokeSubmit) {
  const phone = process.env.PHONE || '+15555550123';
  const payload = {
    slug,
    name: 'Smoke Test Lead',
    phone,
    email: 'smoke@example.com',
    budget: '2500',
    timeline: 'Next month',
    preferredAreas: 'Downtown',
    notes: 'Smoke test submission',
  };

  await check('valid public apply submission succeeds', async () => {
    const res = await fetch(`${base}/api/public/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expectStatus(res.status, [201, 200], 'POST /api/public/apply valid payload');
  });

  await check('duplicate public apply submission is safely handled', async () => {
    const res = await fetch(`${base}/api/public/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // second write should dedupe and return success (typically 200)
    expectStatus(res.status, [200, 201], 'POST /api/public/apply duplicate payload');
  });
}

if (failures.length) {
  console.error('\nSmoke checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('\nAll smoke checks passed.');
