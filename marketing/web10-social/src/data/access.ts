// ── access.ts — access recovery ─────────────────────────────────────────────
// Executes the confirmatory access verdict from w.verifyAccess() (the node is
// the oracle — see knowledge/knowledge-base/web10-v3/sdk/api.md "Access
// Health"). It never guesses from status codes; it runs the verdict's ordered
// `actions`, honoring a cooldown so a transient false positive can't churn the
// user into a re-auth loop.
//
// Generic oracle, app-specific recovery (D60): the oracle checks only universal
// legs (token, user, contract) — it does NOT know about the followers group.
// The followers-group heal is THIS app's concern, done client-side here (the
// social app is the one that knows what the followers group is).
//
// The load-bearing rule (definite NO vs. UNKNOWN): a verdict that is
// `inconclusive` (a check couldn't run — store unreadable) takes NO action.
// Only decisive negatives (contract missing, token dead, user gone) drive
// recovery. A deploy window must not look like "contract missing."

import { getV3Client } from './v3';
import type { AccessVerdict } from './v3';
import { ensureFollowers } from './groups';
import { getSocialAuth } from '../interfaces/auth';

const LOG = (...args: unknown[]) => console.log('[access]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[access]', ...args);
// A transient "oracle unreachable" is a retry-later, not an error — warn, not
// error (console.error would trip the e2e console-error assertions).
const LOG_WARN = (...args: unknown[]) => console.warn('[access]', ...args);

// The services the social app needs — the recovery verifies these. The signal
// is platform-level (the node checks them); this list is the app's policy.
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
// window, the recovery stops acting and surfaces a manual "Log in again" signal
// (the loop-breaker — the system tries once, then hands the user the wheel).
const COOLDOWN_MS = 5 * 60 * 1000;
const lastRecovery: Record<string, number> = {};

export type AccessRecoveryResult =
  | { outcome: 'ok' }
  | { outcome: 'recovered'; actions: string[] }
  | { outcome: 'inconclusive' }
  | { outcome: 'needs_manual'; reason: string };

export interface VerifyAndRecoverOptions {
  /** When false (the on-mount call), a `reauth` (which opens the auth popup)
   *  is NOT auto-executed — it's deferred to an actual failure (the reactive
   *  path) or a user-initiated "Log in again". A popup on page load would be
   *  glitchy; a popup when an action fails is expected. The safe local actions
   *  (the followers-group heal, signout) still run on mount. */
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
export function _resetRecoveryCooldown(): void {
  for (const k of Object.keys(lastRecovery)) delete lastRecovery[k];
}

/**
 * Verify access and execute the verdict's recovery actions.
 * Call at mount (when signed in, with allowReauth: false) and after a data
 * failure (allowReauth defaults true).
 */
export async function verifyAndRecover(
  options: VerifyAndRecoverOptions = {},
): Promise<AccessRecoveryResult> {
  const allowReauth = options.allowReauth ?? true;
  const w = getV3Client();
  const token = w.readToken();
  if (!token) {
    // Not signed in — the login screen owns this, not the recovery.
    LOG('verifyAndRecover — no token, skipping (login screen owns sign-in)');
    return { outcome: 'needs_manual', reason: 'not_signed_in' };
  }

  let verdict: AccessVerdict;
  try {
    verdict = await w.verifyAccess({ services: SOCIAL_SERVICES, operations: SOCIAL_OPERATIONS });
  } catch (e) {
    // The verify call itself failed (network / 5xx) — a transient infra
    // error, NOT a bad session. No action (definite-NO-vs-UNKNOWN).
    LOG_WARN('verifyAndRecover — verifyAccess unreachable (transient, no action):', e);
    return { outcome: 'inconclusive' };
  }

  LOG('verifyAndRecover — verdict:', JSON.stringify(verdict));

  if (verdict.status === 'inconclusive') {
    // A check couldn't run (store unreadable) — no action, retry later.
    LOG('verifyAndRecover — inconclusive, taking no action');
    return { outcome: 'inconclusive' };
  }

  const executed: string[] = [];

  // invalid — the token is dead (or the user is gone). Execute the decisive
  // actions (reauth / signout). No followers-group heal — a dead token can't
  // heal the group; the reauth re-derives a live session first.
  if (verdict.status === 'invalid') {
    for (const action of verdict.actions) {
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

  // ok or degraded — the token is valid. First the app's own followers-group
  // heal (D60: the oracle is generic, so the social app ensures its OWN group
  // here — idempotent, a no-op when healthy). It runs BEFORE the reauth
  // deferral check so it still runs on mount (the token is valid there).
  if (!inCooldown('heal_followers_group')) {
    try {
      LOG('verifyAndRecover — ensuring the followers group for', token.username);
      await ensureFollowers(token.username, token.provider);
      markRecovered('heal_followers_group');
      executed.push('heal_followers_group');
    } catch (e) {
      LOG_ERR('verifyAndRecover — followers-group heal failed:', e);
      return { outcome: 'needs_manual', reason: 'action_failed:heal_followers_group' };
    }
  }

  // Then the oracle's actions (reauth for a degraded contract; none for ok).
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
