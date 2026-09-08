import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── The app contract's service list (the group-403 regression) ─────────────
// The group create/edit 403s ("No app contract for … to create on
// web10-social-group-identity") happened because the login contract
// (SOCIAL_SERVICES in src/interfaces/auth.ts) listed every service the data
// layer touches EXCEPT the two added later: the group's face (D60, an
// app-named service) and the D69 notification store. The API enforces the
// contract per service+operation on the request Origin, so a service missing
// from the contract 403s on every CRUD write.
//
// Two pins:
//   1. the login contract the app sends (via the real D42 seam —
//      openAuthPortal + contractRequest) grants BOTH services the four CRUD
//      operations;
//   2. the session-health oracle (verifyAccess in src/data/access.ts)
//      verifies the SAME list — a service the app writes but the oracle
//      doesn't check is invisible to the recovery, so a pre-fix user's
//      partial contract would never trigger the reauth that merges the
//      missing grant in (the auth UI's applyACR merges on re-consent).

import { installWeb10Mock } from './helpers/web10Mock';

describe('the social app contract covers every CRUD service the data layer touches', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('the login contract grants web10-social-group-identity + notifications (the group 403 regression)', async () => {
    const mock = installWeb10Mock();
    const { getSocialAuth } = await import('@/interfaces/auth');
    getSocialAuth().login();

    expect(mock.openAuthPortal).toHaveBeenCalledTimes(1);
    expect(mock.client.contractRequest).toHaveBeenCalledTimes(1);
    const [contracts] = mock.client.contractRequest.mock.calls[0] as unknown as [
      { kind: string; app_origin: string; permissions: Record<string, string[]> }[],
    ];
    expect(contracts).toHaveLength(1);
    const contract = contracts[0];
    expect(contract.kind).toBe('app');
    expect(contract.app_origin).toBe(window.location.origin);

    const ops = ['create', 'readAll', 'updateOwn', 'deleteOwn'];
    // The group's face (D60) — create-group + the face editor write it.
    expect(contract.permissions['web10-social-group-identity']).toEqual(ops);
    // The D69 notification store — the last_seen cursor doc.
    expect(contract.permissions['notifications']).toEqual(ops);
    // The pre-existing services stay granted (no regression on the rest).
    for (const svc of ['posts', 'media', 'public_media', 'profile', 'settings', 'comments', 'reactions', 'contacts', 'staging_posts']) {
      expect(contract.permissions[svc]).toEqual(ops);
    }
  });

  it('the session-health oracle verifies the same service set as the login contract', async () => {
    const mockVerifyAccess = vi.fn().mockResolvedValue({
      status: 'ok',
      token: 'valid',
      user: 'exists',
      contract: { state: 'granted', missing_services: [] },
      actions: [],
      username: 'testuser',
      provider: 'api.localhost',
    });
    vi.doMock('@/data/v3', async (importOriginal) => {
      const original = await importOriginal() as Record<string, unknown>;
      return {
        ...original,
        getV3Client: vi.fn(() => ({
          verifyAccess: mockVerifyAccess,
          readToken: vi.fn(() => ({ username: 'testuser', provider: 'api.localhost' })),
        })),
      };
    });
    vi.doMock('@/data/groups', async (importOriginal) => {
      const original = await importOriginal() as Record<string, unknown>;
      return { ...original, ensureFollowers: vi.fn().mockResolvedValue('g') };
    });
    vi.doMock('@/interfaces/auth', () => ({
      getSocialAuth: vi.fn(() => ({
        login: vi.fn(),
        signOut: vi.fn(),
        isSignedIn: vi.fn(() => true),
        readToken: vi.fn(),
        authListen: vi.fn(),
      })),
    }));

    const { verifyAndRecover } = await import('@/data/access');
    await verifyAndRecover();

    expect(mockVerifyAccess).toHaveBeenCalledTimes(1);
    const [args] = mockVerifyAccess.mock.calls[0] as unknown as [{ services: string[]; operations: string[] }];
    expect(args.services).toContain('web10-social-group-identity');
    expect(args.services).toContain('notifications');
    // The oracle list is the contract list — same services, same order.
    expect(args.services).toEqual([
      'posts',
      'media',
      'public_media',
      'profile',
      'settings',
      'comments',
      'reactions',
      'contacts',
      'staging_posts',
      'web10-social-group-identity',
      'notifications',
    ]);
  });
});
