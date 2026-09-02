import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── access recovery (src/data/access.ts) ────────────────────────────────────
// Pins the recovery's execution of the verifyAccess verdict: each action, the
// cooldown (the loop-breaker), the inconclusive no-op (definite-NO-vs-UNKNOWN),
// and replace-not-strand (reauth never clears the token first).
//
// Generic oracle, app-specific recovery (D60): the oracle checks only universal
// legs (token, user, contract) — it does NOT know about the followers group.
// The followers-group heal is THIS app's concern, run client-side here (the
// social app is the one that knows what the followers group is). It runs when
// the token is valid (verdict ok/degraded), not when it's dead (invalid).

// vi.hoisted — these must exist before the hoisted vi.mock factories run.
const { mockVerifyAccess, mockReadToken, mockEnsureFollowers, mockLogin, mockSignOut } =
  vi.hoisted(() => ({
    mockVerifyAccess: vi.fn(),
    mockReadToken: vi.fn(),
    mockEnsureFollowers: vi.fn(),
    mockLogin: vi.fn(),
    mockSignOut: vi.fn(),
  }));

vi.mock('../../data/v3', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getV3Client: vi.fn(() => ({
      verifyAccess: mockVerifyAccess,
      readToken: mockReadToken,
    })),
  };
});

vi.mock('../../data/groups', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return { ...original, ensureFollowers: mockEnsureFollowers };
});

vi.mock('../../interfaces/auth', () => ({
  getSocialAuth: vi.fn(() => ({
    login: mockLogin,
    signOut: mockSignOut,
    isSignedIn: vi.fn(() => true),
    readToken: mockReadToken,
    authListen: vi.fn(),
  })),
}));

import { verifyAndRecover, _resetRecoveryCooldown } from '../../data/access';

const TOKEN = { username: 'testuser', provider: 'api.localhost' };

function verdict(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    token: 'valid',
    user: 'exists',
    contract: { state: 'granted', missing_services: [] },
    actions: [],
    username: 'testuser',
    provider: 'api.localhost',
    ...overrides,
  };
}

describe('access recovery — verifyAndRecover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRecoveryCooldown();
    mockReadToken.mockReturnValue(TOKEN);
    mockEnsureFollowers.mockResolvedValue('api.localhost/groups/users/testuser/followers');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a healthy session ensures the followers group (idempotent heal)', async () => {
    // The token is valid → the app ensures its OWN followers group (D60). The
    // heal is idempotent (a no-op when healthy) but still runs.
    mockVerifyAccess.mockResolvedValue(verdict());
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('recovered');
    if (res.outcome !== 'recovered') return;
    expect(res.actions).toEqual(['heal_followers_group']);
    expect(mockEnsureFollowers).toHaveBeenCalledWith('testuser', 'api.localhost');
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('an inconclusive verdict (store unreadable) takes NO action', async () => {
    // definite-NO-vs-UNKNOWN: a check that couldn't run is not a missing
    // contract — no reauth, no heal, no churn.
    mockVerifyAccess.mockResolvedValue(
      verdict({
        status: 'inconclusive',
        contract: { state: 'unknown', missing_services: [] },
        actions: [],
      }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('inconclusive');
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockEnsureFollowers).not.toHaveBeenCalled();
  });

  it('a missing contract heals the group + re-auths', async () => {
    mockVerifyAccess.mockResolvedValue(
      verdict({
        status: 'degraded',
        contract: { state: 'missing', missing_services: ['posts', 'profile'] },
        actions: ['reauth'],
      }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('recovered');
    if (res.outcome !== 'recovered') return;
    // heal first (the token is valid), then reauth (fix the contract).
    expect(res.actions).toEqual(['heal_followers_group', 'reauth']);
    expect(mockEnsureFollowers).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it('reauth is replace-not-strand — it never signs out first', async () => {
    mockVerifyAccess.mockResolvedValue(
      verdict({ status: 'degraded', actions: ['reauth'] }),
    );
    await verifyAndRecover();
    // A blocked popup must not strand the user signed-out — the recovery kicks
    // off the re-derive but does NOT clear the existing token.
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it('a deleted account signs out (terminal, no heal — the token is dead)', async () => {
    const signedOut = vi.fn();
    window.addEventListener('session:signed-out', signedOut);
    mockVerifyAccess.mockResolvedValue(
      verdict({
        status: 'invalid',
        user: 'not_found',
        actions: ['signout'],
      }),
    );
    const res = await verifyAndRecover();
    window.removeEventListener('session:signed-out', signedOut);
    expect(res.outcome).toBe('recovered');
    if (res.outcome !== 'recovered') return;
    expect(res.actions).toEqual(['signout']);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockLogin).not.toHaveBeenCalled();
    // No heal — a dead token can't heal the group.
    expect(mockEnsureFollowers).not.toHaveBeenCalled();
    // Signals the app to show the login screen.
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('a dead token re-auths (no heal — the token can’t heal the group)', async () => {
    mockVerifyAccess.mockResolvedValue(
      verdict({
        status: 'invalid',
        token: 'expired',
        actions: ['reauth'],
      }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('recovered');
    if (res.outcome !== 'recovered') return;
    expect(res.actions).toEqual(['reauth']);
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockEnsureFollowers).not.toHaveBeenCalled();
  });

  it('on mount (allowReauth: false) a missing contract heals the group but defers reauth', async () => {
    // A popup on page load would be glitchy — the mount recovery defers reauth
    // (surfacing a soft signal) and lets an actual failure trigger it. The heal
    // (a safe local action) still runs on mount.
    mockVerifyAccess.mockResolvedValue(
      verdict({
        status: 'degraded',
        contract: { state: 'missing', missing_services: ['posts'] },
        actions: ['reauth'],
      }),
    );
    const res = await verifyAndRecover({ allowReauth: false });
    expect(res.outcome).toBe('needs_manual');
    if (res.outcome !== 'needs_manual') return;
    expect(res.reason).toBe('reauth_deferred');
    expect(mockLogin).not.toHaveBeenCalled(); // no popup on mount
    expect(mockEnsureFollowers).toHaveBeenCalledTimes(1); // the heal still ran
  });

  it('the cooldown defers a repeat recovery to manual (the loop-breaker)', async () => {
    // First degraded verdict → heal + reauth execute.
    mockVerifyAccess.mockResolvedValueOnce(
      verdict({ status: 'degraded', actions: ['reauth'] }),
    );
    await verifyAndRecover();
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockEnsureFollowers).toHaveBeenCalledTimes(1);

    // Second degraded verdict (store still down / still broken) within the
    // cooldown → no second auto-reauth; hand the user the wheel.
    mockVerifyAccess.mockResolvedValueOnce(
      verdict({ status: 'degraded', actions: ['reauth'] }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('needs_manual');
    if (res.outcome !== 'needs_manual') return;
    expect(res.reason).toBe('cooldown:reauth');
    expect(mockLogin).toHaveBeenCalledTimes(1); // still one — the cooldown held
  });

  it('a verifyAccess failure (transient) is inconclusive, not a recovery', async () => {
    mockVerifyAccess.mockRejectedValue(new Error('network down'));
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('inconclusive');
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('no token → needs_manual (the login screen owns sign-in)', async () => {
    mockReadToken.mockReturnValue(null);
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('needs_manual');
    if (res.outcome !== 'needs_manual') return;
    expect(res.reason).toBe('not_signed_in');
    expect(mockVerifyAccess).not.toHaveBeenCalled();
  });

  it('a failed heal defers to manual', async () => {
    mockEnsureFollowers.mockRejectedValue(new Error('group create failed'));
    mockVerifyAccess.mockResolvedValue(verdict());
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('needs_manual');
    if (res.outcome !== 'needs_manual') return;
    expect(res.reason).toBe('action_failed:heal_followers_group');
  });
});
