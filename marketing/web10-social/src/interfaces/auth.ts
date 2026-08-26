// ── auth.ts — the D42 auth seam (D46: the app talks to the SDK directly) ────
// Login goes through the REAL consent popup — the same flow the demos run
// (docs/hello/script.js is the reference): openAuthPortal opens the popup,
// contractRequest sends the app contract into it (reusing the popup, never a
// second blocked window), and authListen hands back the token into the
// `token=` cookie. The SDK's authListen dedupes (D45) — the callback fires
// only on a real transition (first login), not on the redundant same-user
// delivery from the lazy group popup.
//
// The SDK surface comes from the self-hosted browser build at /wapi.js
// (window.web10 — index.html loads it before the app bundle). The ESM
// 'web10-npm' package provides the types; the runtime is the IIFE.
//
// Session sync (3.12.0): the data client's v3Post is state-first
// (state.token ?? cookie — D45 rejected changing that precedence in the
// SDK), so this seam keeps its state.token in step with the cookie on
// every transition: setToken on login (authListen), scrubToken on
// signOut. The token cookie remains the session's source of truth.
//
// One-tap survives via D42 auto-complete: on a return run the popup is
// already signed in and the contract already granted, so it hands back the
// token and closes itself with zero UI — no "all set" screen, no extra tap.

import { API_ORIGIN, AUTH_ORIGIN } from '../lib/origins';
import { getV3Client } from '../data/v3';
import type { TokenPayload, V3AppCR, V3Client } from 'web10-npm';

const LOG = (...args: unknown[]) => console.log('[social]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[social]', ...args);

export interface SocialAuth {
  /** Open the consent popup + request the app contract (the one tap). */
  login: () => void;
  /** Cookie-first: true when a `token=` cookie is present. */
  isSignedIn: () => boolean;
  /** Scrub the token cookie (the session is cookie-backed). */
  signOut: () => void;
  /** Register the signed-in callback (D45-deduped by the SDK). */
  authListen: (callback: () => void) => void;
  /** Decode the cookie token — null when signed out. */
  readToken: () => { provider: string; username: string } | null;
}

// The v3 services the data layer (src/data/*) touches. The app contract
// grants this app's origin these services on the user's node; the API
// enforces per-service operations on the request Origin header
// (api/app/v3/endpoints/documents.py).
const SOCIAL_SERVICES = [
  'posts',
  'media',
  'public_media',
  'profile',
  'settings',
  'comments',
  'reactions',
  'contacts',
  'staging_posts',
] as const;

// The four operations the documents endpoint enforces (create / read /
// update / delete).
const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'] as const;

function socialAppContract(): V3AppCR {
  return {
    kind: 'app',
    // The origin that actually makes the API calls — the API matches the
    // request Origin header against allowed_origin exactly.
    app_origin: window.location.origin,
    permissions: Object.fromEntries(
      SOCIAL_SERVICES.map((service) => [service, [...SOCIAL_OPERATIONS]]),
    ),
  };
}

function createSocialAuth(): SocialAuth {
  const host = window.location.hostname;
  // Go local when served from any *.localhost host (so social.localhost ->
  // auth.localhost -> social.localhost works without build args) — the
  // old adapter's dev-mode switch, kept.
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost');
  const authOrigin = local ? 'http://auth.localhost' : AUTH_ORIGIN;
  // Same API origin as the data layer (src/data/v3.ts) — the contract
  // fast path must check the same node the CRUD calls hit.
  const apiOrigin = API_ORIGIN;
  LOG('auth init — host:', host, 'local:', local, 'authOrigin:', authOrigin, 'apiOrigin:', apiOrigin);

  const web10 = window.web10;
  if (!web10) {
    LOG_ERR('window.web10 missing — /wapi.js (the SDK browser build) did not load; auth is inert');
  }

  // One client for the contract round-trip. The IIFE build patches
  // contractRequest to reuse the openAuthPortal popup (a second window.open
  // gets popup-blocked) and to fast-path return runs where the contract
  // already exists (no popup at all).
  const client: V3Client | null = web10 ? web10.createV3Client({ apiOrigin }) : null;

  function login(): void {
    if (!web10 || !client) {
      LOG_ERR('login tapped but the SDK is not loaded — nothing to do');
      return;
    }
    LOG('login tapped — opening auth portal at', authOrigin);
    const popup = web10.openAuthPortal(authOrigin);
    if (!popup) {
      LOG_ERR('auth popup blocked or failed to open — login aborted');
      return;
    }
    const contract = socialAppContract();
    LOG('sending app contract:', JSON.stringify(contract));
    client.contractRequest([contract], authOrigin, (resp) => {
      LOG(
        'contractRequest callback — status:', resp.status,
        resp.errors ? `errors: ${JSON.stringify(resp.errors)}` : '',
      );
      if (resp.status !== 'approved') {
        LOG_ERR('app contract not approved:', resp.status, resp.errors ?? 'unknown');
      }
    });
  }

  function isSignedIn(): boolean {
    if (!web10) return false;
    const token = web10.readTokenCookie();
    LOG('isSignedIn — token cookie present:', token != null);
    return token != null;
  }

  function readToken(): { provider: string; username: string } | null {
    if (!web10) return null;
    const token = web10.readTokenCookie();
    const decoded: TokenPayload | null = token ? web10.decodeJwt(token) : null;
    return decoded ? { provider: decoded.provider, username: decoded.username } : null;
  }

  function signOut(): void {
    if (!web10) return;
    LOG('signOut — scrubbing token cookie');
    web10.scrubTokenCookie();
    // The data client's v3Post is state-first (state.token ?? cookie — D45
    // rejected changing that precedence in the SDK), so scrub its in-memory
    // token too: otherwise a post-sign-out data call would still carry the
    // previous user's token.
    getV3Client().scrubToken();
    LOG('signOut — data client token scrubbed');
  }

  function authListen(callback: () => void): void {
    if (!web10) return;
    LOG('authListen registered');
    web10.authListen(() => {
      LOG('authListen fired — signed in as', JSON.stringify(readToken()));
      // The SDK's authListen set the cookie but not the data client's
      // state.token (its v3Post is state-first). Re-sync state with the
      // cookie so a same-session re-login acts as the NEW user, not the
      // previous one — the successor to the old adapter's
      // syncDataLayerToken mirror.
      const token = web10.readTokenCookie();
      if (token) {
        getV3Client().setToken(token);
        LOG('authListen — data client token re-synced from cookie');
      }
      callback();
    });
  }

  return { login, isSignedIn, signOut, authListen, readToken };
}

// Singleton: App's effect can re-run (StrictMode double-mount) without
// stacking duplicate window message listeners.
let auth: SocialAuth | null = null;

export function getSocialAuth(): SocialAuth {
  if (!auth) {
    auth = createSocialAuth();
  }
  return auth;
}
