// ── v3.ts — the data client seam (D46: the SDK's createV3Client) ───────────
// The hand-rolled fetch client is retired. getV3Client() returns the SDK's
// createV3Client (web10-npm, the file:../../sdk dependency) — the same
// client the demos run. The data modules keep their API; the swap is inside
// this seam.
//
// Why this also fixes the data layer: the hand-rolled client sent
// `collection` in CRUD payloads, but the API's models expect `service`
// (renamed in #537, same day the app's data layer landed — the app was
// never updated, so its CRUD was 422ing). The SDK sends `service`.
//
// Token semantics: the SDK's readToken/isSignedIn are cookie-first (state
// fallback), and v3Post falls back to the cookie when state.token is null.
// v3Post is state-FIRST (state.token ?? cookie) — D45 rejected changing
// that precedence in the SDK — so the auth seam re-syncs state.token on
// session transitions (setToken on login, scrubToken on sign-out); see
// src/interfaces/auth.ts. The token cookie remains the session's source of
// truth (3.11.0).
//
// This module re-exports the SDK's token utilities + types so the @/data
// barrel (and the tests that mock this module) keep their surface.

import { createV3Client, type V3Client } from 'web10-npm';
import { API_ORIGIN } from '../lib/origins';

export {
  cookieDict,
  readTokenCookie,
  setTokenCookie,
  scrubTokenCookie,
  decodeJwt,
  isTokenExpired,
  Web10Error,
} from 'web10-npm';
export type {
  TokenPayload,
  V3ClientOptions,
  V3Document,
  V3Group,
  V3GroupMember,
  V3InviteResponse,
  V3JoinRequest,
  V3ServiceContract,
  V3CR,
  V3AppCR,
  V3GroupCR,
  V3GroupRole,
  V3GroupMemberCR,
  V3User,
  V3LoginResponse,
  V3Client,
  SessionVerdict,
  VerifySessionOptions,
  SessionStatus,
  SessionTokenState,
  SessionUserState,
  SessionContractState,
  SessionFollowersState,
  SessionAction,
} from 'web10-npm';

// ── V3 client singleton ─────────────────────────────────────────────────────

let v3Client: V3Client | null = null;

export function getV3Client(): V3Client {
  if (!v3Client) {
    v3Client = createV3Client({ apiOrigin: API_ORIGIN });
  }
  return v3Client;
}

export function resetV3Client(): void {
  v3Client = null;
}
