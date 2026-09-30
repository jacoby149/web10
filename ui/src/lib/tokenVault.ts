// tokenVault — per-account live tokens so the login picker can switch to ANY
// previously-authenticated account in one tap, not just the session that
// happens to be live in the popup.
//
// rememberedAccounts.ts stores identifiers only (the password is still
// required for a non-vaulted account). The vault goes one step further: it
// keeps the live token for the last few accounts authenticated on THIS
// origin, so "Continue as" is available for every remembered account, not
// only the one whose token is in the cookie.
//
// Trust boundary: the single `token` cookie is not httpOnly, so a token in
// localStorage is the SAME exposure class — a script on the authenticator's
// origin already reads the live token. The vault does not widen the boundary;
// it just makes the switching the list already promised actually possible.
//
// Entries are keyed by (provider, username), capped, most-recent-first. An
// entry is only usable on the node whose provider it names (the token is
// signed by that node) — `vaultedAccountsFor` filters by the expected
// provider so the picker never offers a one-tap switch that would 401.

export interface VaultedToken {
  username: string;
  provider: string;
  token: string;
}

const KEY = 'web10.tokenVault';
const MAX = 5;

function read(): VaultedToken[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is VaultedToken =>
        !!a && typeof a.username === 'string' && a.username.length > 0 &&
        typeof a.provider === 'string' && a.provider.length > 0 &&
        typeof a.token === 'string' && a.token.length > 0,
    );
  } catch {
    return [];
  }
}

function write(accounts: VaultedToken[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(accounts));
  } catch {
    // Storage full / unavailable — non-fatal, the vault just holds fewer.
  }
}

function keyOf(username: string, provider: string): string {
  return provider + '/' + username;
}

// Upsert: move the account to the front (most recent), dedup by
// (provider, username), cap at MAX.
export function vaultToken(entry: VaultedToken): void {
  if (!entry || !entry.username || !entry.provider || !entry.token) return;
  const rest = read().filter(
    (a) => keyOf(a.username, a.provider) !== keyOf(entry.username, entry.provider),
  );
  write([entry, ...rest].slice(0, MAX));
}

export function getVaultedToken(username: string, provider: string): string | null {
  const hit = read().find(
    (a) => keyOf(a.username, a.provider) === keyOf(username, provider),
  );
  return hit ? hit.token : null;
}

export function removeVaultedToken(username: string, provider: string): void {
  write(
    read().filter(
      (a) => keyOf(a.username, a.provider) !== keyOf(username, provider),
    ),
  );
}

// The vaulted accounts usable on the node the popup is talking to. The
// picker offers a one-tap switch only for these — a token from another
// provider is useless here (the node won't verify it).
export function vaultedAccountsFor(expectedProvider: string): VaultedToken[] {
  if (!expectedProvider) return read();
  return read().filter((a) => a.provider === expectedProvider);
}
