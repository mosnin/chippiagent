import test from 'node:test';
import assert from 'node:assert/strict';

// ── Admin authorization contract (mirrors lib/admin.ts logic) ───────────────

function checkAdminFromMetadata(publicMetadata) {
  if (!publicMetadata) return false;
  return publicMetadata.role === 'admin';
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('user with role=admin in publicMetadata is admin', () => {
  assert.equal(checkAdminFromMetadata({ role: 'admin' }), true);
});

test('user with role=user in publicMetadata is NOT admin', () => {
  assert.equal(checkAdminFromMetadata({ role: 'user' }), false);
});

test('user with no role in publicMetadata is NOT admin', () => {
  assert.equal(checkAdminFromMetadata({}), false);
});

test('user with null publicMetadata is NOT admin', () => {
  assert.equal(checkAdminFromMetadata(null), false);
});

test('user with undefined publicMetadata is NOT admin', () => {
  assert.equal(checkAdminFromMetadata(undefined), false);
});

test('user with role=Admin (capitalized) is NOT admin — exact match required', () => {
  assert.equal(checkAdminFromMetadata({ role: 'Admin' }), false);
});

test('user with role=ADMIN (uppercase) is NOT admin — exact match required', () => {
  assert.equal(checkAdminFromMetadata({ role: 'ADMIN' }), false);
});

test('user with role as number is NOT admin', () => {
  assert.equal(checkAdminFromMetadata({ role: 1 }), false);
});

test('user with role as boolean true is NOT admin', () => {
  assert.equal(checkAdminFromMetadata({ role: true }), false);
});

// ── Middleware route matching simulation ────────────────────────────────────

function isAdminRoute(path) {
  return path.startsWith('/admin') || path.startsWith('/api/admin');
}

function isProtectedRoute(path) {
  return (
    path.startsWith('/dashboard') ||
    path.startsWith('/s/') ||
    path.startsWith('/setup') ||
    path.startsWith('/admin')
  );
}

function isPublicRoute(path) {
  return (
    path === '/' ||
    path.startsWith('/sign-in') ||
    path.startsWith('/sign-up')
  );
}

function resolveMiddleware(path, userId, isAdmin) {
  if (isProtectedRoute(path) && !isPublicRoute(path)) {
    if (!userId) return 'redirect_sign_in';
    if (isAdminRoute(path) && !isAdmin) return 'redirect_home';
  }
  return 'allow';
}

test('unauthenticated user is blocked from admin routes', () => {
  assert.equal(resolveMiddleware('/admin', null, false), 'redirect_sign_in');
  assert.equal(resolveMiddleware('/admin/users', null, false), 'redirect_sign_in');
  // Note: /api/admin routes are protected at the handler level via requireAdmin(),
  // not via middleware route matching (API routes use a different protection model)
});

test('authenticated non-admin user is blocked from admin routes', () => {
  assert.equal(resolveMiddleware('/admin', 'user1', false), 'redirect_home');
  assert.equal(resolveMiddleware('/admin/users', 'user1', false), 'redirect_home');
  assert.equal(resolveMiddleware('/admin/users/abc123', 'user1', false), 'redirect_home');
});

test('authenticated admin user is allowed into admin routes', () => {
  assert.equal(resolveMiddleware('/admin', 'user1', true), 'allow');
  assert.equal(resolveMiddleware('/admin/users', 'user1', true), 'allow');
  assert.equal(resolveMiddleware('/admin/users/abc123', 'user1', true), 'allow');
});

test('admin routes are in protected routes', () => {
  assert.equal(isProtectedRoute('/admin'), true);
  assert.equal(isProtectedRoute('/admin/users'), true);
});

test('admin routes are NOT in public routes', () => {
  assert.equal(isPublicRoute('/admin'), false);
  assert.equal(isPublicRoute('/admin/users'), false);
});

test('non-admin user can still access regular protected routes', () => {
  assert.equal(resolveMiddleware('/dashboard', 'user1', false), 'allow');
  assert.equal(resolveMiddleware('/s/my-slug', 'user1', false), 'allow');
  assert.equal(resolveMiddleware('/setup', 'user1', false), 'allow');
});

test('public routes remain accessible to everyone', () => {
  assert.equal(resolveMiddleware('/', null, false), 'allow');
  assert.equal(resolveMiddleware('/sign-in', null, false), 'allow');
  assert.equal(resolveMiddleware('/sign-up', null, false), 'allow');
});

// ── Repair action logic simulation ─────────────────────────────────────────

function determineRepairAction(user) {
  const hasSpace = !!user.space;
  const isOnboarded = !!user.onboard;

  if (!isOnboarded && hasSpace) return 'backfill_onboard';
  if (isOnboarded && !hasSpace) return 'reset_onboarding';
  return 'none';
}

test('repair: user with space but onboard=false → backfill', () => {
  assert.equal(
    determineRepairAction({ onboard: false, space: { id: 's1' } }),
    'backfill_onboard'
  );
});

test('repair: user onboarded but no space → reset', () => {
  assert.equal(
    determineRepairAction({ onboard: true, space: null }),
    'reset_onboarding'
  );
});

test('repair: healthy user (onboarded + space) → no action', () => {
  assert.equal(
    determineRepairAction({ onboard: true, space: { id: 's1' } }),
    'none'
  );
});

test('repair: new user (not onboarded, no space) → no action', () => {
  assert.equal(
    determineRepairAction({ onboard: false, space: null }),
    'none'
  );
});
