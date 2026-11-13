import "react-phone-input-2/lib/bootstrap.css";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";
import Password from "./FormInputs/Password";
import ReTypePass from "./FormInputs/ReTypePass";
import Contact from "./FormInputs/Contact";
import BetaCode from "./FormInputs/BetaCode";
import CredentialStatus from "./CredentialStatus";
import { Button } from '@/components/ui/button';

// `embedded` renders just the fields + actions (no card chrome, no headline)
// so it can sit inside another surface — e.g. ConsentView, which supplies its
// own "connect {host}" header. Mirrors LoginForm's embedded contract.
function SignupForm({ I, embedded = false }: { I: Record<string, any>; embedded?: boolean }) {
  const form = (
    <>
      {!embedded && (
        <>
          <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">Create your account.</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">One web10 account. Your data, on your terms.</p>
        </>
      )}

      <form
        className={embedded ? "space-y-5" : "mt-6 space-y-5"}
        onSubmit={(e) => {
          // A real submit: the form element is what password managers key off
          // to detect a registration and offer fills. preventDefault keeps the
          // SPA flow (no navigation) — the values come from the same DOM the
          // button's click handler used to scrape.
          e.preventDefault();
          const [provider, username, password, betacode, retype, contact] = [
            (document.getElementById("provider") as HTMLInputElement).value,
            (document.getElementById("username") as HTMLInputElement).value,
            (document.getElementById("password") as HTMLInputElement).value,
            (document.getElementById("betacode") as HTMLInputElement | null)?.value ?? "",
            (document.getElementById("retypepass") as HTMLInputElement).value,
            (document.getElementById("contact") as HTMLInputElement).value,
          ];
          I.signup(provider, username, password, retype, betacode, contact);
        }}
      >
        <Username I={I} />
        <Password I={I} />
        <ReTypePass I={I} />
        <Contact I={I} />
        <BetaCode I={I} />
        <Provider I={I} />

        <Button
          variant="brand"
          type="submit"
          className="h-12 w-full"
          data-testid="signup-submit"
        >
          Create account
        </Button>
      </form>

      <CredentialStatus I={I} />

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => I.setMode("login")}
          className="inline-flex min-h-11 items-center rounded px-2 text-sm text-brand-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="signup-login-link"
        >
          Already have an account?
        </button>
      </div>
    </>
  );

  if (embedded) return <div>{form}</div>;

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-lg border border-border bg-card p-6 sm:p-8">{form}</div>
    </div>
  );
}

export default SignupForm;
