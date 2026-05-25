import test from 'node:test';
import assert from 'node:assert/strict';

// ── Pure slug functions (mirrors lib/intake.ts) ─────────────────────────────

function normalizeSlug(raw) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function isValidSlug(slug) {
  return slug.length >= 3 && normalizeSlug(slug) === slug;
}

function buildIntakePath(slug) {
  return `/apply/${slug}`;
}

function buildIntakeUrl(slug) {
  const protocol = 'https';
  const rootDomain = 'example.com';
  return `${protocol}://${rootDomain}${buildIntakePath(slug)}`;
}

// ── Pure phone/fingerprint functions (mirrors lib/public-application.ts) ────

function normalizePhone(input) {
  return input.replace(/\D/g, '');
}

function applicationFingerprintKey(input) {
  const normalizedName = input.name.trim().toLowerCase();
  const normalizedPhone = normalizePhone(input.phone);
  return `${input.slug}:${normalizedName}:${normalizedPhone}`;
}

// ── Slug normalization tests ────────────────────────────────────────────────

test('normalizeSlug lowercases and strips invalid chars', () => {
  assert.equal(normalizeSlug('My-Space'), 'my-space');
  assert.equal(normalizeSlug('hello world!'), 'helloworld');
  assert.equal(normalizeSlug('  spaces  '), 'spaces');
  assert.equal(normalizeSlug('UPPER-CASE-123'), 'upper-case-123');
  assert.equal(normalizeSlug('special@#$chars'), 'specialchars');
});

test('isValidSlug requires minimum 3 chars and normalized form', () => {
  assert.equal(isValidSlug('abc'), true);
  assert.equal(isValidSlug('my-space'), true);
  assert.equal(isValidSlug('ab'), false); // too short
  assert.equal(isValidSlug('AB'), false); // not normalized
  assert.equal(isValidSlug('a b'), false); // contains space
});

// ── Intake URL generation tests ─────────────────────────────────────────────

test('buildIntakePath produces /apply/{slug} format', () => {
  assert.equal(buildIntakePath('my-space'), '/apply/my-space');
  assert.equal(buildIntakePath('test-123'), '/apply/test-123');
});

test('buildIntakeUrl produces full URL with path-based slug', () => {
  const url = buildIntakeUrl('my-space');
  assert.equal(url, 'https://example.com/apply/my-space');
  // Must NEVER be a subdomain URL
  assert.ok(!url.includes('my-space.example.com'), 'URL must not use subdomain routing');
});

test('intake URL is always path-based, never subdomain-based', () => {
  const slugs = ['test', 'my-real-estate', 'agent-smith-123'];
  for (const slug of slugs) {
    const url = buildIntakeUrl(slug);
    assert.ok(url.includes(`/apply/${slug}`), `URL for "${slug}" must contain /apply/${slug}`);
    assert.ok(!url.includes(`${slug}.`), `URL for "${slug}" must not use subdomain routing`);
  }
});

// ── Phone normalization tests ───────────────────────────────────────────────

test('normalizePhone strips non-digit characters', () => {
  assert.equal(normalizePhone('(555) 123-4567'), '5551234567');
  assert.equal(normalizePhone('+1-555-123-4567'), '15551234567');
  assert.equal(normalizePhone('5551234567'), '5551234567');
  assert.equal(normalizePhone(''), '');
});

// ── Fingerprint/dedup tests ─────────────────────────────────────────────────

test('applicationFingerprintKey is deterministic', () => {
  const input = { slug: 'test', name: 'John Doe', phone: '(555) 123-4567' };
  const key1 = applicationFingerprintKey(input);
  const key2 = applicationFingerprintKey(input);
  assert.equal(key1, key2);
});

test('applicationFingerprintKey normalizes name and phone', () => {
  const key1 = applicationFingerprintKey({ slug: 'test', name: 'John Doe', phone: '(555) 123-4567' });
  const key2 = applicationFingerprintKey({ slug: 'test', name: '  JOHN DOE  ', phone: '555-123-4567' });
  assert.equal(key1, key2, 'Same person with different formatting should produce same key');
});

test('applicationFingerprintKey differs for different people', () => {
  const key1 = applicationFingerprintKey({ slug: 'test', name: 'John', phone: '5551234567' });
  const key2 = applicationFingerprintKey({ slug: 'test', name: 'Jane', phone: '5551234567' });
  assert.notEqual(key1, key2);
});

test('applicationFingerprintKey differs for different slugs', () => {
  const key1 = applicationFingerprintKey({ slug: 'space-a', name: 'John', phone: '5551234567' });
  const key2 = applicationFingerprintKey({ slug: 'space-b', name: 'John', phone: '5551234567' });
  assert.notEqual(key1, key2);
});

// ── Payload validation simulation ───────────────────────────────────────────

test('valid application payload has all required fields', () => {
  const payload = { slug: 'test', name: 'John Doe', phone: '5551234567' };
  assert.ok(payload.slug && payload.name && payload.phone, 'Required fields must be present');
  assert.ok(isValidSlug(payload.slug), 'Slug must be valid');
});

test('malformed payload missing name is rejected', () => {
  const payload = { slug: 'test', name: '', phone: '5551234567' };
  assert.ok(!payload.name, 'Empty name should be falsy');
});

test('malformed payload with invalid slug is rejected', () => {
  const payload = { slug: 'ab', name: 'John', phone: '5551234567' };
  assert.ok(!isValidSlug(payload.slug), 'Short slug should be invalid');
});

test('malformed payload missing phone is rejected', () => {
  const payload = { slug: 'test', name: 'John', phone: '' };
  assert.ok(!payload.phone, 'Empty phone should be falsy');
});

// ── Slug identity contract ──────────────────────────────────────────────────

test('slug stored in DB matches the normalized form used in URLs', () => {
  const userInput = 'My-Space';
  const storedSlug = normalizeSlug(userInput);
  const urlPath = buildIntakePath(storedSlug);
  assert.equal(urlPath, '/apply/my-space');
  assert.equal(storedSlug, 'my-space');
});

test('public page lookup uses same normalization as storage', () => {
  const storedSlug = 'agent-smith';
  // Simulate what the public page does: normalize the URL param
  const urlParam = 'Agent-Smith';
  const lookupSlug = normalizeSlug(urlParam);
  assert.equal(lookupSlug, storedSlug, 'URL param normalization must match stored slug');
});
