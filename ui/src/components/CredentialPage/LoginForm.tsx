import Password from "./FormInputs/Password";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";
import CredentialStatus from "./CredentialStatus";
import { Button } from '@/components/ui/button';

// `embedded` renders just the fields + actions (no card chrome, no
// "create account") so it can sit inside another surface — e.g. ConsentView.
function LoginForm({ I, embedded = false }: { I: Record<string, any>; embedded?: boolean }) {
  const remembered: { username: string; provider: string }[] = I.rememberedAccounts || [];

  // Picking a remembered account pre-fills the provider + username and focuses
  // the password — the Google-style fast path. The password is still required
  // (the list is identifiers only, never a token).
  function selectAccount(a: { username: string; provider: string }) {
    const p = document.getElementById('provider') as HTMLInputElement | null;
    const u = document.getElementById('username') as HTMLInputElement | null;
    if (p) p.value = a.provider;
    if (u) u.value = a.username;
    const pw = document.getElementById('password') as HTMLInputElement | null;
    if (pw) pw.focus();
  }

  const form = (
    <>
      {!embedded && (
        <>
          <h1 className="font-display text-xl font-semibold text-foreground">Log in to your node</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your data, your keys, your rules.</p>
        </>
      )}

      {/* Remembered-accounts picker — the fast path for a returning user.
          Only rendered when there's something to pick. */}
      {remembered.length > 0 && (
        <div className={embedded ? "mb-4" : "mb-6"} data-testid="account-picker">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Choose an account
          </div>
          <div className="space-y-1.5">
            {remembered.map((a) => (
              <button
                key={a.provider + '/' + a.username}
                type="button"
                data-testid={`account-picker-${a.username}`}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => selectAccount(a)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-muted text-sm font-semibold text-brand-300">
                  {a.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{a.username}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.provider}</span>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 text-sm text-brand-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="account-picker-other"
            onClick={() => {
              const u = document.getElementById('username') as HTMLInputElement | null;
              if (u) { u.value = ''; u.focus(); }
            }}
          >
            Use another account
          </button>
        </div>
      )}

      {/* Primary sign-in — the contact-anchored flow (D61): phone or email →
          code → pick an account. The username+password form stays as the
          fallback for accounts without a contact. */}
      <Button
        variant="brand"
        className={embedded ? "mt-4 w-full" : "mt-6 w-full"}
        data-testid="login-contact-cta"
        onClick={() => I.setMode("forgot")}
      >
        Sign in with phone or email
      </Button>

      {!embedded && (
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>or username and password</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <div className={embedded ? "space-y-1" : "space-y-1"}>
        <Provider I={I} />
        <Username I={I} />
        <Password I={I} />
      </div>

      <Button
        variant="brand"
        className="mt-2 w-full"
        data-testid="login-submit"
        onClick={() => {
          I.login(
            (document.getElementById("provider") as HTMLInputElement).value,
            (document.getElementById("username") as HTMLInputElement).value,
            (document.getElementById("password") as HTMLInputElement).value,
          );
        }}
      >
        Log in
      </Button>

      <CredentialStatus I={I} />

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => I.setMode("forgot")}
          className="rounded text-sm text-brand-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="login-forgot-link"
        >
          Forgot username or password?
        </button>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div>
        {form}
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => I.setMode("signup")}
          data-testid="login-create-account"
        >
          Create a new account
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded border border-border bg-card p-6 sm:p-8">{form}</div>
      <Button
        variant="outline"
        className="mt-4 w-full"
        onClick={() => I.setMode("signup")}
        data-testid="login-create-account"
      >
        Create a new account
      </Button>
    </div>
  );
}

export default LoginForm;
