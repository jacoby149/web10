import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bug A regression: web10-social builds TWO wapi/client instances — one for
// auth (the adapter) and a separate one for the data layer (createWapiWrapper).
// Both read the token cookie once at init; a FRESH login sets the token only on
// the auth instance, so the data-layer instance stayed tokenless and every CRUD
// threw "not authenticated" until a page refresh. Web10SocialAdapter now mirrors
// the token onto the data-layer instance on login. This test pins that.
//
// The web10-npm mock returns a DISTINCT instance per wapiInit() call, mirroring
// reality (auth instance !== data-layer instance) — a single shared instance
// would hide the bug.
const h = vi.hoisted(() => {
  const instances: any[] = [];
  const make = () => {
    const w: any = { token: null, _cb: null };
    w.setToken = (t: string) => { w.token = t; };
    w.authListen = (cb: () => void) => { w._cb = cb; };
    w.isSignedIn = () => w.token != null;
    w.readToken = () => (w.token ? { provider: 'p', username: 'u' } : null);
    const noop = () => undefined;
    for (const m of [
      'signOut', 'scrubToken', 'openAuthPortal', 'SMROnReady', 'SMRResponseListen',
      'getTieredToken', 'send', 'initP2P', 'read', 'create', 'update', 'delete',
      'aggregate', 'getUploadUrl',
    ]) w[m] = noop;
    instances.push(w);
    return w;
  };
  return { instances, make };
});

vi.mock('web10-npm', () => ({
  wapiInit: () => h.make(),
  wapiAuthInit: () => ({}),
}));

import web10SocialAdapterInit from '../interfaces/Web10SocialAdapter';
import { getWapi, resetWapi } from '../data/wapi';

describe('Bug A — token hand-off to the data layer', () => {
  beforeEach(() => {
    resetWapi();
    h.instances.length = 0;
  });

  it('leaves the data-layer instance tokenless at mount, then propagates the token on login', () => {
    web10SocialAdapterInit();

    // wapiInit called twice: [0] auth (adapter), [1] data-layer (createWapiWrapper)
    const authWapi = h.instances[0];
    const dataWapi = h.instances[1];
    expect(h.instances.length).toBe(2);

    // At mount, before any login: the data-layer instance has no token — this is
    // the state that used to strand every CRUD call.
    expect(dataWapi.token).toBeNull();
    expect(getWapi().readToken()).toBeNull();

    // Login lands: the SDK sets the token on the AUTH instance (+ cookie) and
    // fires its authListen callback. Simulate that sequence.
    authWapi.token = 'HEADER.PAYLOAD.SIG';
    authWapi._cb();

    // The fix mirrors it onto the data-layer instance, so the data layer is now
    // authenticated without a page refresh.
    expect(dataWapi.token).toBe('HEADER.PAYLOAD.SIG');
    expect(getWapi().readToken()).toEqual({ provider: 'p', username: 'u' });
  });
});
