import Password from "./FormInputs/Password";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";
import CredentialStatus from "./CredentialStatus";
import { Button } from '@/components/ui/button';
import { isTokenExpired } from 'web10-npm';
import { ArrowRight, ChevronRight, KeyRound, Plus, UserRoundPlus } from 'lucide-react';
import { useSignInView } from '@/lib/useSignInView';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

// `embedded` renders the entry actions without card chrome or a headline,
// so ConsentView can provide the destination context.
function LoginForm({ I, embedded = false, continueAction }: { I: Record<string, any>; embedded?: boolean; continueAction?: ReactNode }) {
  const remembered: { username: string; provider: string }[] = I.rememberedAccounts || [];
  const { passwordView, showPassword } = useSignInView();
  const showFields = passwordView || (remembered.length === 0 && !continueAction);
  const focusField = useRef<string | null>(null);
  const previousView = useRef(showFields);
  useLayoutEffect(() => {
    if (showFields && focusField.current) {
      document.getElementById(focusField.current)?.focus();
      focusField.current = null;
    }
    if (!showFields && previousView.current) {
      I.setLoginUsername?.('');
      document.getElementById('account-picker-other')?.focus();
    }
    previousView.current = showFields;
  }, [showFields]);
  // Accounts with a LIVE (non-expired) vaulted token on THIS node — a one-tap
  // switch, no password (the token IS the proof). Expired / revoked tokens
  // fall back to the identifier path (pre-fill + password). The rest are
  // identifiers only and pre-fill the form (password still required).
  const vaulted = new Set<string>(
    ((I.vaultedAccounts || []) as { username: string; provider: string; token: string }[])
      .filter((a) => !isTokenExpired(a.token))
      .map((a) => a.provider + '/' + a.username),
  );
  const isVaulted = (a: { username: string; provider: string }) => vaulted.has(a.provider + '/' + a.username);

  // Picking a remembered account:
  //  - vaulted → one-tap switch (adopt the live token, confirm, reload grants)
  //  - otherwise → pre-fill the provider + username and focus the password
  //    (the Google-style fast path; the password is still required).
  function selectAccount(a: { username: string; provider: string }) {
    if (isVaulted(a)) {
      I.switchAccount?.(a.username, a.provider);
      return;
    }
    focusField.current = 'password';
    showPassword(true);
    const p = document.getElementById('provider') as HTMLInputElement | null;
    const u = document.getElementById('username') as HTMLInputElement | null;
    if (p) p.value = a.provider;
    if (u) u.value = a.username;
    I.setLoginUsername?.(a.username);
  }

  const form = (
    <>
      {!embedded && (
        <>
          <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">Welcome back.</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Sign in to your web10 account.</p>
        </>
      )}

      {/* Remembered-accounts picker — the fast path for a returning user.
          Only rendered when there's something to pick. */}
      {remembered.length > 0 && (
        <div className={embedded ? '' : 'mt-6'} data-testid="account-picker" hidden={showFields}>
          <div className="mb-3 text-xs font-medium text-muted-foreground">
            Your accounts
          </div>
          <div className="space-y-1.5">
            {remembered.map((a) => (
              <button
                key={a.provider + '/' + a.username}
                type="button"
                data-testid={`account-picker-${a.username}`}
                className="flex min-h-16 w-full items-center gap-3 rounded border border-border bg-elevated/50 px-4 py-3 text-left transition-colors hover:border-brand/50 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => selectAccount(a)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-muted text-sm font-semibold text-brand-300">
                  {a.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{a.username}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.provider}</span>
                </span>
                {isVaulted(a) && (
                  <span className="shrink-0 text-xs text-muted-foreground" data-testid={`account-picker-instant-${a.username}`}>
                    <ChevronRight aria-hidden="true" className="h-4 w-4" /><span className="sr-only">Continue without password</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          {continueAction && <div className="mt-4">{continueAction}</div>}
        </div>
      )}

      {remembered.length === 0 && !showFields && continueAction}
      {!showFields && (
          <button
            type="button"
            id="account-picker-other"
            className="mt-3 flex min-h-16 w-full cursor-pointer items-center gap-3 rounded border border-border bg-elevated/50 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:border-brand/50 hover:bg-elevated active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            data-testid="account-picker-other"
            onClick={() => {
              focusField.current = 'username';
              showPassword(true);
              const u = document.getElementById('username') as HTMLInputElement | null;
              if (u) u.value = '';
              I.setLoginUsername?.('');
            }}
          >
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-muted text-brand-300">
              <Plus className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <span className="flex-1">Use another account</span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
      )}

      {/* Both existing sign-in methods remain available; only their hierarchy changes. */}

      {showFields && remembered.length > 0 && (
        <Button variant="ghost" className="min-h-11 w-full text-muted-foreground" onClick={() => { I.setLoginUsername?.(''); showPassword(false); }} data-testid="login-back-accounts">Back to your accounts</Button>
      )}

      <div hidden={!showFields}>
      <form
        className="mt-4 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          I.login(
            (document.getElementById("provider") as HTMLInputElement).value,
            (document.getElementById("username") as HTMLInputElement).value,
            (document.getElementById("password") as HTMLInputElement).value,
          );
        }}
      >
        <Username I={I} showHelp={false} />
        <Password I={I} />
        <Provider I={I} />
        <Button variant="brand" type="submit" className="h-12 w-full gap-2" data-testid="login-submit">
          Log in <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </form>
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" /><span>or</span><div className="h-px flex-1 bg-border" /></div>
      <Button
        variant="outline"
        className="h-12 w-full gap-2"
        data-testid="login-contact-cta"
        onClick={() => I.setMode("forgot")}
      >
        <KeyRound aria-hidden="true" className="h-4 w-4" /> Sign in with phone or email
      </Button>

      <CredentialStatus I={I} />

      <div className="mt-2 text-center" hidden={!showFields}>
        <button
          type="button"
          onClick={() => I.setMode("forgot")}
          className="inline-flex min-h-11 items-center rounded px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="login-forgot-link"
        >
          Forgot username or password?
        </button>
      </div>
    </>
  );

  const createAccount = (
    <div className="mt-5 border-t border-border pt-5">
      <p className="mb-3 text-center text-sm font-medium text-foreground">New to web10?</p>
      <Button
        variant="outline"
        className="h-12 w-full gap-2 border-brand/50 bg-brand-muted/30 text-brand-300 hover:border-brand hover:bg-brand-muted/60 active:bg-brand-muted"
        onClick={() => I.setMode('signup')}
        data-testid="login-create-account"
      >
        <UserRoundPlus aria-hidden="true" className="h-5 w-5" strokeWidth={1.5} />
        Create an account
        <ArrowRight aria-hidden="true" className="ml-auto h-4 w-4" />
      </Button>
    </div>
  );

  if (embedded) {
    return (
      <div>
        {form}
        {createAccount}
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-lg border border-border bg-card p-6 sm:p-8">{form}</div>
      {createAccount}
    </div>
  );
}

export default LoginForm;
