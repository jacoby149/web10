// rememberedAccounts — a Google-style account picker for the login screen.
//
// The authenticator (this origin) remembers the last few accounts signed in
// here, so a return visit — or a sign-out → sign-in from an app — can re-
// authenticate by PICKING an account instead of re-typing it. This is what
// makes the "which account am I?" question answerable: the consent popup no
// longer silently auto-completes with the stale session, it offers the list.
//
// The list is per-origin (localStorage on the authenticator's origin), capped,
// most-recent-first, deduped by (provider, username). It is a convenience
// cache of identifiers only — never a token, never a password. Picking an
// account pre-fills the form; the password is still required (except the
// "Continue as" fast path for the session already live in this popup).

export interface RememberedAccount {
  username: string;
  provider: string;
}

const KEY = 'web10.rememberedAccounts';
const MAX = 5;

function read(): RememberedAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is RememberedAccount =>
        !!a && typeof a.username === 'string' && a.username.length > 0 &&
        typeof a.provider === 'string' && a.provider.length > 0,
    );
  } catch {
    return [];
  }
}

function write(accounts: RememberedAccount[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(accounts));
  } catch {
    // Storage full / unavailable — non-fatal, the picker just shows fewer.
  }
}

export function getRememberedAccounts(): RememberedAccount[] {
  return read();
}

// Upsert: move the account to the front (most recent), dedup by
// (provider, username), cap at MAX.
export function rememberAccount(account: RememberedAccount): void {
  if (!account || !account.username || !account.provider) return;
  const rest = read().filter(
    (a) => !(a.username === account.username && a.provider === account.provider),
  );
  write([account, ...rest].slice(0, MAX));
}

export function removeAccount(account: RememberedAccount): void {
  if (!account || !account.username || !account.provider) return;
  write(
    read().filter(
      (a) => !(a.username === account.username && a.provider === account.provider),
    ),
  );
}
