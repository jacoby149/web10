// ── session.ts — the SessionGuard ───────────────────────────────────────────
// Executes the confirmatory session verdict from w.verifySession() (the node
// is the oracle — see knowledge/knowledge-base/web10-v3/sdk/api.md
// "Session Health"). The guard never guesses from status codes; it runs the
// verdict's ordered `actions`, honoring a cooldown so a transient false
// positive can't churn the user into a re-auth loop.
//
// The load-bearing rule (definite NO vs. UNKNOWN): a verdict that is
// `inconclusive` (a check couldn't run — store unreadable) takes NO action.
// Only decisive negatives (contract missing, group broken, token dead, user
// gone) drive recovery. A deploy window must not look like "contract missing."

import { getV3Client } from './v3';
import type { SessionVerdict } from './v3';
import { ensureFollowers } from './groups';
import { getSocialAuth } from '../interfaces/auth';

const LOG = (...args: unknown[]) => console.log('[session]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[session]', ...args);
// A transient "oracle unreachable" is a retry-later, not an error — warn, not
// error (console.error would trip the e2e console-error assertions).
const LOG_WARN = (...args: unknown[]) => console.warn('[session]', ...args);

// The services the social app needs — the guard verifies these. The signal is
// platform-level (the node checks them); this list is the app's policy.
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
];
const SOCIAL_OPERATIONS = ['readAll', 'create'];

// Cooldown: max one auto-recovery per action-class per window. After the
// window, the guard stops acting and surfaces a manual "Log in again" signal
// (the loop-breaker — the system tries once, then hands the user the wheel).
const COOLDOWN_MS = 5 * 60 * 1000;
const lastRecovery: Record<string, number> = {};

export type SessionGuardResult =
  | { outcome: 'ok' }
  | { outcome: 'recovered'; actions: string[] }
  | { outcome: 'inconclusive' }
  | { outcome: 'needs_manual'; reason: string };

export interface VerifyAndRecoverOptions {
  /** When false (the on-mount call), a `reauth` (which opens the auth popup)
   *  is NOT auto-executed — it's deferred to an actual failure (the reactive
   *  path) or a user-initiated "Log in again". A popup on page load would be
   *  glitchy; a popup when an action fails is expected. The safe local actions
   *  (heal_followers_group, signout) still run on mount. */
  allowReauth?: boolean;
}

function inCooldown(action: string): boolean {
  const last = lastRecovery[action];
  return last !== undefined && Date.now() - last < COOLDOWN_MS;
}

function markRecovered(action: string): void {
  lastRecovery[action] = Date.now();
}

/** Test hook — clear the cooldown state. */
export function _resetSessionGuardCooldown(): void {
  for (const k of Object.keys(lastRecovery)) delete lastRecovery[k];
}

/**
 * Verify the session and execute the verdict's recovery actions.
 * Call at mount (when signed in, with allowReauth: false) and after a data
 * failure (allowReauth defaults true).
 */
export async function verifyAndRecover(
  options: VerifyAndRecoverOptions = {},
): Promise<SessionGuardResult> {
  const allowReauth = options.allowReauth ?? true;
  const w = getV3Client();
  const token = w.readToken();
  if (!token) {
    // Not signed in — the login screen owns this, not the guard.
    LOG('verifyAndRecover — no token, skipping (login screen owns sign-in)');
    return { outcome: 'needs_manual', reason: 'not_signed_in' };
  }

  let verdict: SessionVerdict;
  try {
    verdict = await w.verifySession({ services: SOCIAL_SERVICES, operations: SOCIAL_OPERATIONS });
  } catch (e) {
    // The verify call itself failed (network / 5xx) — a transient infra
    // error, NOT a bad session. No action (definite-NO-vs-UNKNOWN).
    LOG_WARN('verifyAndRecover — verifySession unreachable (transient, no action):', e);
    return { outcome: 'inconclusive' };
  }

  LOG('verifyAndRecover — verdict:', JSON.stringify(verdict));

  if (verdict.status === 'ok') {
    return { outcome: 'ok' };
  }
  if (verdict.status === 'inconclusive') {
    // A check couldn't run (store unreadable) — no action, retry later.
    LOG('verifyAndRecover — inconclusive, taking no action');
    return { outcome: 'inconclusive' };
  }

  // degraded or invalid — execute the decisive actions, honoring the cooldown.
  const executed: string[] = [];
  for (const action of verdict.actions) {
    if (action === 'reauth' && !allowReauth) {
      // On mount, don't open the popup — surface a soft "log in again" signal
      // and let an actual failure (or the user) trigger the reauth.
      LOG('verifyAndRecover — reauth deferred (mount); surfacing a manual signal');
      return { outcome: 'needs_manual', reason: 'reauth_deferred' };
    }
    if (inCooldown(action)) {
      LOG(`verifyAndRecover — ${action} is in cooldown; deferring to manual`);
      return { outcome: 'needs_manual', reason: `cooldown:${action}` };
    }
    try {
      await executeAction(action);
      markRecovered(action);
      executed.push(action);
      LOG(`verifyAndRecover — executed ${action}`);
    } catch (e) {
      LOG_ERR(`verifyAndRecover — ${action} failed:`, e);
      return { outcome: 'needs_manual', reason: `action_failed:${action}` };
    }
  }
  return executed.length ? { outcome: 'recovered', actions: executed } : { outcome: 'ok' };
}

async function executeAction(action: string): Promise<void> {
  const auth = getSocialAuth();
  switch (action) {
    case 'reauth': {
      // Re-derive through the rooted authenticator (fresh token + contract).
      // REPLACE-ON-ARRIVAL: the handed-back token overwrites the stale cookie
      // (authListen does this naturally). We do NOT scrub first — a blocked
      // popup or a transient failure must not strand the user signed-out.
      LOG('reauth — re-deriving the session via the authenticator');
      auth.login();
      return;
    }
    case 'heal_followers_group': {
      const token = getV3Client().readToken();
      if (!token) throw new Error('no token to heal the group with');
      LOG('heal_followers_group — ensuring the followers group for', token.username);
      await ensureFollowers(token.username, token.provider);
      return;
    }
    case 'signout': {
      // Terminal — a deleted account can't be re-authed. Clear the session and
      // let the app show the login screen.
      LOG('signout — terminal (user not found), clearing the session');
      auth.signOut();
      window.dispatchEvent(
        new CustomEvent('session:signed-out', { detail: { reason: 'user_not_found' } }),
      );
      return;
    }
    default:
      LOG(`executeAction — unknown action "${action}", ignoring`);
  }
}
