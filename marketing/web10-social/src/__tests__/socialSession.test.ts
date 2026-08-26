import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Session semantics after D46 (3.11.0): the token cookie is the session's
// source of truth. The D42 authListen sets it on login and signOut scrubs
// it — both without touching the data client — so the data client must be
// cookie-authoritative: requests carry the cookie's token, and a same-
// session sign-out -> re-login never acts as the previous user (the old
// adapter's syncDataLayerToken mirror is replaced by the cookie-first read).

// A minimal JWT the v3.ts decodeJwt (atob of part 2) can parse.
function fakeJwt(username: string, provider: string): string {
  const payload = btoa(JSON.stringify({ username, provider, site: 'web10' }));
  return `hdr.${payload}.sig`;
}

const JWT_A = fakeJwt('usera', 'web10.app');
const JWT_B = fakeJwt('userb', 'web10.app');

describe('data client is cookie-authoritative (sign-out + re-login)', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.cookie.split(';').forEach((c) => {
      const key = c.split('=')[0].trim();
      if (key) document.cookie = `${key}=;max-age=-1;path=/`;
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
      text: async () => '',
    });
  });

  it('isSignedIn / readToken follow the cookie, not a frozen closure', async () => {
    const v3 = await import('@/data/v3');
    v3.setTokenCookie(JWT_A);
    const w = v3.getV3Client();
    expect(w.isSignedIn()).toBe(true);
    expect(w.readToken()?.username).toBe('usera');

    // sign-out scrubs the cookie (what auth.signOut does)
    v3.scrubTokenCookie();
    expect(w.isSignedIn()).toBe(false);

    // re-login sets a DIFFERENT user's cookie (what authListen does)
    v3.setTokenCookie(JWT_B);
    expect(w.isSignedIn()).toBe(true);
    expect(w.readToken()?.username).toBe('userb');
  });

  it('requests carry the cookie token after a same-session re-login (no stale closure)', async () => {
    const v3 = await import('@/data/v3');
    v3.setTokenCookie(JWT_A);
    const w = v3.getV3Client(); // the closure would freeze on JWT_A here
    await w.read('posts', { groups: ['web10.app/groups/web10/discover'] });
    const firstBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(firstBody.token).toBe(JWT_A);

    v3.scrubTokenCookie();
    v3.setTokenCookie(JWT_B);
    await w.read('posts', { groups: ['web10.app/groups/web10/discover'] });
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const lastBody = JSON.parse(calls[calls.length - 1][1].body);
    expect(lastBody.token).toBe(JWT_B);
  });

  it('sign-out stops data calls (no token available after the scrub)', async () => {
    const v3 = await import('@/data/v3');
    v3.setTokenCookie(JWT_A);
    const w = v3.getV3Client();
    v3.scrubTokenCookie();
    await expect(w.read('posts', { groups: ['g'] })).rejects.toThrow(/No token available/);
  });
});
