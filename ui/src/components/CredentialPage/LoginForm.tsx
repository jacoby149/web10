import Password from "./FormInputs/Password";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";
import { Button } from '@/components/ui/button';

// `embedded` renders just the fields + actions (no card chrome, no
// "create account") so it can sit inside another surface — e.g. ConsentView.
function LoginForm({ I, embedded = false }: { I: Record<string, any>; embedded?: boolean }) {
  const form = (
    <>
      {!embedded && (
        <>
          <h1 className="font-display text-xl font-semibold text-foreground">Log in to your node</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your data, your keys, your rules.</p>
        </>
      )}

      <div className={embedded ? "space-y-1" : "mt-6 space-y-1"}>
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
