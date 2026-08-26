import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Session semantics after D46 (3.11.0 + 3.12.0): the token cookie is the
// session's source of truth. The data client is the SDK's createV3Client —
// its readToken/isSignedIn are cookie-first (state fallback) and its
// v3Post is state-first (state.token ?? cookie; D45 rejected changing that
// precedence in the SDK). So session transitions go through the client's
// setToken/scrubToken (the auth seam drives them — src/interfaces/auth.ts),
// keeping cookie and state in step, and a same-session sign-out -> re-login
// never acts as the previous user.

// A minimal JWT the SDK's decodeJwt (atob of part 2) can parse.
function fakeJwt(username: string, provider: string): string {
  const payload = btoa(JSON.stringify({ username, provider, site: 'web10' }));
  return `hdr.${payload}.sig`;
}

const JWT_A = fakeJwt('usera', 'web10.app');
const JWT_B = fakeJwt('userb', 'web10.app');

describe('data client session semantics (SDK client + seam sync)', () => {
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

  it('isSignedIn / readToken follow the session (cookie-first, state in step)', async () => {
    const v3 = await import('@/data/v3');
    v3.setTokenCookie(JWT_A);
    const w = v3.getV3Client();
    expect(w.isSignedIn()).toBe(true);
    expect(w.readToken()?.username).toBe('usera');

    // sign-out the way the app does (auth seam: cookie + state)
    w.scrubToken();
    expect(w.isSignedIn()).toBe(false);

    // re-login the way the app does (auth seam: cookie + state)
    w.setToken(JWT_B);
    expect(w.isSignedIn()).toBe(true);
    expect(w.readToken()?.username).toBe('userb');
  });

  it('requests carry the session token after a same-session re-login (no stale state)', async () => {
    const v3 = await import('@/data/v3');
    v3.setTokenCookie(JWT_A);
    const w = v3.getV3Client(); // state.token = JWT_A
    await w.read('posts', { groups: ['web10.app/groups/web10/discover'] });
    const firstBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(firstBody.token).toBe(JWT_A);
    // the wire field is `service` (the API's model field — the hand-rolled
    // client sent `collection`, which the API 422s since #537's rename)
    expect(firstBody.service).toBe('posts');
    expect(firstBody.collection).toBeUndefined();

    // the app's transition calls (what the auth seam makes): sign-out
    // scrubs state + cookie, login re-syncs them
    w.scrubToken();
    w.setToken(JWT_B);
    await w.read('posts', { groups: ['web10.app/groups/web10/discover'] });
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const lastBody = JSON.parse(calls[calls.length - 1][1].body);
    expect(lastBody.token).toBe(JWT_B);
  });

  it('sign-out stops data calls (no token available after the scrub)', async () => {
    const v3 = await import('@/data/v3');
    v3.setTokenCookie(JWT_A);
    const w = v3.getV3Client();
    w.scrubToken(); // the app's sign-out path (auth seam: cookie + state)
    await expect(w.read('posts', { groups: ['g'] })).rejects.toThrow(/No token available/);
  });

  it('the auth seam keeps the data client in step (signOut scrubs, authListen re-syncs)', async () => {
    const v3 = await import('@/data/v3');
    v3.setTokenCookie(JWT_A);
    const w = v3.getV3Client(); // state.token = JWT_A
    expect(w.readToken()?.username).toBe('usera');

    const { installWeb10Mock } = await import('./helpers/web10Mock');
    // The SDK's authListen sets the cookie BEFORE firing the (deduped)
    // signed-in callback — the mock's readTokenCookie returns the token the
    // cookie holds at callback time.
    const mock = installWeb10Mock({
      token: JWT_B,
      payload: { username: 'userb', provider: 'web10.app', site: 'web10' },
    });
    const { getSocialAuth } = await import('@/interfaces/auth');
    const auth = getSocialAuth();
    // App registers the signed-in listener — that's what arms the seam
    auth.authListen(() => {});

    // sign-out the way the app does: scrubs the cookie AND the data client
    auth.signOut();
    expect(mock.scrubTokenCookie).toHaveBeenCalled();
    expect(w.isSignedIn()).toBe(false); // data client state scrubbed
    await expect(w.read('posts', { groups: ['g'] })).rejects.toThrow(/No token available/);

    // login the way the SDK delivers it: callback fires, seam re-syncs
    const onSignedIn = mock.authListen.mock.calls[0][0] as (signedIn: boolean) => void;
    onSignedIn(true);
    expect(w.readToken()?.username).toBe('userb');
    await w.read('posts', { groups: ['g'] });
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const lastBody = JSON.parse(calls[calls.length - 1][1].body);
    expect(lastBody.token).toBe(JWT_B);
  });
});
