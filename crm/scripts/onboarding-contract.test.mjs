import test from 'node:test';
import assert from 'node:assert/strict';

// ── Pure routing functions (mirrors lib/onboarding-routing.ts) ──────────────

function resolveOnboardingPageAccess(state) {
  if (state.isOnboarded) return 'redirect_dashboard';
  return 'show_onboarding';
}

function resolveDashboardEntry(state) {
  if (!state.isOnboarded) return 'redirect_onboarding';
  if (state.hasSpace) return 'redirect_workspace';
  return 'repair_and_redirect_onboarding';
}

// ── Pure onboarding helpers (mirrors lib/onboarding.ts) ─────────────────────

function getOnboardingStatus(user) {
  return {
    hasUser: !!user,
    hasSpace: !!user?.space,
    isOnboarded: !!user?.onboard,
  };
}

function shouldBackfillOnboardFromSpace(user) {
  const status = getOnboardingStatus(user);
  return status.hasUser && status.hasSpace && !status.isOnboarded;
}

// ── Routing contract tests ──────────────────────────────────────────────────

test('onboard=true user visiting onboarding is redirected away', () => {
  const result = resolveOnboardingPageAccess({ isOnboarded: true, hasSpace: true });
  assert.equal(result, 'redirect_dashboard');
});

test('onboard=true user entering dashboard resolves to workspace', () => {
  const result = resolveDashboardEntry({ isOnboarded: true, hasSpace: true });
  assert.equal(result, 'redirect_workspace');
});

test('onboard=false user enters onboarding flow', () => {
  const onboardingPage = resolveOnboardingPageAccess({ isOnboarded: false, hasSpace: false });
  const dashboard = resolveDashboardEntry({ isOnboarded: false, hasSpace: false });
  assert.equal(onboardingPage, 'show_onboarding');
  assert.equal(dashboard, 'redirect_onboarding');
});

test('completion transition flips route behavior immediately', () => {
  const before = resolveDashboardEntry({ isOnboarded: false, hasSpace: true });
  const after = resolveDashboardEntry({ isOnboarded: true, hasSpace: true });
  assert.equal(before, 'redirect_onboarding');
  assert.equal(after, 'redirect_workspace');
});

test('refresh after completion remains out of onboarding', () => {
  const first = resolveOnboardingPageAccess({ isOnboarded: true, hasSpace: true });
  const refresh = resolveOnboardingPageAccess({ isOnboarded: true, hasSpace: true });
  assert.equal(first, 'redirect_dashboard');
  assert.equal(refresh, 'redirect_dashboard');
});

// ── New: onboarded user NEVER sees onboarding (all state combos) ────────────

test('onboarded user with space never sees onboarding page', () => {
  const result = resolveOnboardingPageAccess({ isOnboarded: true, hasSpace: true });
  assert.notEqual(result, 'show_onboarding');
});

test('onboarded user without space triggers repair on dashboard', () => {
  const result = resolveDashboardEntry({ isOnboarded: true, hasSpace: false });
  assert.equal(result, 'repair_and_redirect_onboarding');
});

test('onboarded user without space visiting onboarding is still redirected away', () => {
  // Even if they have no space, onboarded=true means redirect
  const result = resolveOnboardingPageAccess({ isOnboarded: true, hasSpace: false });
  assert.equal(result, 'redirect_dashboard');
});

// ── Backfill contract tests ────────────────────────────────────────────────

test('backfill triggers for user with space but onboard=false', () => {
  const user = { id: '1', onboard: false, space: { id: 's1' } };
  assert.equal(shouldBackfillOnboardFromSpace(user), true);
});

test('backfill does NOT trigger for already-onboarded user', () => {
  const user = { id: '1', onboard: true, space: { id: 's1' } };
  assert.equal(shouldBackfillOnboardFromSpace(user), false);
});

test('backfill does NOT trigger for user without space', () => {
  const user = { id: '1', onboard: false, space: null };
  assert.equal(shouldBackfillOnboardFromSpace(user), false);
});

test('backfill does NOT trigger for null user', () => {
  assert.equal(shouldBackfillOnboardFromSpace(null), false);
});

// ── getOnboardingStatus contract tests ──────────────────────────────────────

test('getOnboardingStatus uses ONLY onboard field for isOnboarded', () => {
  // A user with onboardingCompletedAt but onboard=false is NOT onboarded
  const userWithTimestamp = { id: '1', onboard: false, onboardingCompletedAt: new Date(), space: null };
  assert.equal(getOnboardingStatus(userWithTimestamp).isOnboarded, false);

  // A user with onboard=true but no onboardingCompletedAt IS onboarded
  const userWithFlag = { id: '1', onboard: true, onboardingCompletedAt: null, space: null };
  assert.equal(getOnboardingStatus(userWithFlag).isOnboarded, true);
});

test('getOnboardingStatus returns hasSpace correctly', () => {
  assert.equal(getOnboardingStatus({ onboard: true, space: { id: 's1' } }).hasSpace, true);
  assert.equal(getOnboardingStatus({ onboard: true, space: null }).hasSpace, false);
  assert.equal(getOnboardingStatus({ onboard: true }).hasSpace, false);
});

// ── Full flow simulation ────────────────────────────────────────────────────

test('full lifecycle: new user → onboard → refresh → never see onboarding again', () => {
  // Step 1: new user visits — should see onboarding
  let state = { isOnboarded: false, hasSpace: false };
  assert.equal(resolveOnboardingPageAccess(state), 'show_onboarding');

  // Step 2: user completes onboarding — dashboard should route to workspace
  state = { isOnboarded: true, hasSpace: true };
  assert.equal(resolveDashboardEntry(state), 'redirect_workspace');

  // Step 3: user refreshes onboarding page — should bounce away
  assert.equal(resolveOnboardingPageAccess(state), 'redirect_dashboard');

  // Step 4: user refreshes dashboard — should go to workspace again
  assert.equal(resolveDashboardEntry(state), 'redirect_workspace');
});

test('space deletion lifecycle: delete space → re-onboard from step 1', () => {
  // Step 1: onboarded user has space
  let state = { isOnboarded: true, hasSpace: true };
  assert.equal(resolveDashboardEntry(state), 'redirect_workspace');

  // Step 2: user deletes space — dashboard triggers repair
  state = { isOnboarded: true, hasSpace: false };
  assert.equal(resolveDashboardEntry(state), 'repair_and_redirect_onboarding');

  // Step 3: after repair, user is back in onboarding
  state = { isOnboarded: false, hasSpace: false };
  assert.equal(resolveOnboardingPageAccess(state), 'show_onboarding');
});
