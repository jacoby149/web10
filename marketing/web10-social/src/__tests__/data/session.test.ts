import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── SessionGuard (src/data/session.ts) ──────────────────────────────────────
// Pins the guard's execution of the verifySession verdict: each action, the
// cooldown (the loop-breaker), the inconclusive no-op (definite-NO-vs-UNKNOWN),
// and replace-not-strand (reauth never clears the token first).

// vi.hoisted — these must exist before the hoisted vi.mock factories run.
const { mockVerifySession, mockReadToken, mockEnsureFollowers, mockLogin, mockSignOut } =
  vi.hoisted(() => ({
    mockVerifySession: vi.fn(),
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
      verifySession: mockVerifySession,
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

import { verifyAndRecover, _resetSessionGuardCooldown } from '../../data/session';

const TOKEN = { username: 'testuser', provider: 'api.localhost' };

function verdict(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    token: 'valid',
    user: 'exists',
    contract: { state: 'granted', missing_services: [] },
    groups: { followers: 'ok' },
    actions: [],
    username: 'testuser',
    provider: 'api.localhost',
    ...overrides,
  };
}

describe('SessionGuard — verifyAndRecover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetSessionGuardCooldown();
    mockReadToken.mockReturnValue(TOKEN);
    mockEnsureFollowers.mockResolvedValue('api.localhost/groups/users/testuser/followers');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a healthy session takes no action', async () => {
    mockVerifySession.mockResolvedValue(verdict());
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('ok');
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockEnsureFollowers).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('an inconclusive verdict (store unreadable) takes NO action', async () => {
    // definite-NO-vs-UNKNOWN: a check that couldn't run is not a missing
    // contract — no reauth, no churn.
    mockVerifySession.mockResolvedValue(
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

  it('a missing contract re-auths (reauth action)', async () => {
    mockVerifySession.mockResolvedValue(
      verdict({
        status: 'degraded',
        contract: { state: 'missing', missing_services: ['posts', 'profile'] },
        actions: ['reauth'],
      }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('recovered');
    if (res.outcome !== 'recovered') return;
    expect(res.actions).toEqual(['reauth']);
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it('reauth is replace-not-strand — it never signs out first', async () => {
    mockVerifySession.mockResolvedValue(
      verdict({ status: 'degraded', actions: ['reauth'] }),
    );
    await verifyAndRecover();
    // A blocked popup must not strand the user signed-out — the guard kicks
    // off the re-derive but does NOT clear the existing token.
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it('a broken followers group heals locally (heal_followers_group)', async () => {
    mockVerifySession.mockResolvedValue(
      verdict({
        status: 'degraded',
        groups: { followers: 'not_member' },
        actions: ['heal_followers_group'],
      }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('recovered');
    expect(mockEnsureFollowers).toHaveBeenCalledWith('testuser', 'api.localhost');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('a deleted account signs out (terminal, not reauth)', async () => {
    const signedOut = vi.fn();
    window.addEventListener('session:signed-out', signedOut);
    mockVerifySession.mockResolvedValue(
      verdict({
        status: 'invalid',
        user: 'not_found',
        actions: ['signout'],
      }),
    );
    const res = await verifyAndRecover();
    window.removeEventListener('session:signed-out', signedOut);
    expect(res.outcome).toBe('recovered');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockLogin).not.toHaveBeenCalled();
    // Signals the app to show the login screen.
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('a dead token re-auths (not heal — the group can’t be checked)', async () => {
    mockVerifySession.mockResolvedValue(
      verdict({
        status: 'invalid',
        token: 'expired',
        groups: { followers: 'unknown' },
        actions: ['reauth'],
      }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('recovered');
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockEnsureFollowers).not.toHaveBeenCalled();
  });

  it('executes reauth before heal when both are needed', async () => {
    const order: string[] = [];
    mockLogin.mockImplementation(() => order.push('reauth'));
    mockEnsureFollowers.mockImplementation(async () => {
      order.push('heal');
      return 'g';
    });
    mockVerifySession.mockResolvedValue(
      verdict({
        status: 'degraded',
        contract: { state: 'missing', missing_services: ['posts'] },
        groups: { followers: 'not_member' },
        actions: ['reauth', 'heal_followers_group'],
      }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('recovered');
    expect(order).toEqual(['reauth', 'heal']);
  });

  it('on mount (allowReauth: false) a missing contract defers reauth to manual (no popup)', async () => {
    // A popup on page load would be glitchy — the mount guard defers reauth
    // (surfacing a soft signal) and lets an actual failure trigger it.
    mockVerifySession.mockResolvedValue(
      verdict({
        status: 'degraded',
        contract: { state: 'missing', missing_services: ['posts'] },
        actions: ['reauth'],
      }),
    );
    const res = await verifyAndRecover({ allowReauth: false });
    if (res.outcome !== 'needs_manual') return;
    expect(res.reason).toBe('reauth_deferred');
    expect(mockLogin).not.toHaveBeenCalled(); // no popup on mount
  });

  it('on mount (allowReauth: false) a broken group still heals locally', async () => {
    // The safe local action (heal) runs on mount even when reauth is deferred.
    mockVerifySession.mockResolvedValue(
      verdict({
        status: 'degraded',
        groups: { followers: 'not_member' },
        actions: ['heal_followers_group'],
      }),
    );
    const res = await verifyAndRecover({ allowReauth: false });
    expect(res.outcome).toBe('recovered');
    expect(mockEnsureFollowers).toHaveBeenCalledTimes(1);
  });

  it('the cooldown defers a repeat recovery to manual (the loop-breaker)', async () => {
    // First degraded verdict → reauth executes.
    mockVerifySession.mockResolvedValueOnce(
      verdict({ status: 'degraded', actions: ['reauth'] }),
    );
    await verifyAndRecover();
    expect(mockLogin).toHaveBeenCalledTimes(1);

    // Second degraded verdict (store still down / still broken) within the
    // cooldown → no second auto-reauth; hand the user the wheel.
    mockVerifySession.mockResolvedValueOnce(
      verdict({ status: 'degraded', actions: ['reauth'] }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('needs_manual');
    if (res.outcome !== 'needs_manual') return;
    expect(res.reason).toBe('cooldown:reauth');
    expect(mockLogin).toHaveBeenCalledTimes(1); // still one — the cooldown held
  });

  it('a verifySession failure (transient) is inconclusive, not a recovery', async () => {
    mockVerifySession.mockRejectedValue(new Error('network down'));
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
    expect(mockVerifySession).not.toHaveBeenCalled();
  });

  it('a failed action defers to manual', async () => {
    mockEnsureFollowers.mockRejectedValue(new Error('group create failed'));
    mockVerifySession.mockResolvedValue(
      verdict({
        status: 'degraded',
        groups: { followers: 'missing' },
        actions: ['heal_followers_group'],
      }),
    );
    const res = await verifyAndRecover();
    expect(res.outcome).toBe('needs_manual');
    if (res.outcome !== 'needs_manual') return;
    expect(res.reason).toBe('action_failed:heal_followers_group');
  });
});
