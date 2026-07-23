import "react-phone-input-2/lib/bootstrap.css";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";
import Password from "./FormInputs/Password";
import ReTypePass from "./FormInputs/ReTypePass";
import Phone from "./FormInputs/Phone";
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
          <h1 className="font-display text-xl font-semibold text-foreground">Create your node</h1>
          <p className="mt-1 text-sm text-muted-foreground">Own your data from the first record.</p>
        </>
      )}

      <div className={embedded ? "space-y-1" : "mt-6 space-y-1"}>
        <Provider I={I} />
        <Username I={I} />
        <Password I={I} />
        <ReTypePass I={I} />
        <Phone I={I} />
        <BetaCode I={I} />
      </div>

      <Button
        variant="brand"
        className="mt-2 w-full"
        data-testid="signup-submit"
        onClick={() => {
          const [provider, username, password, betacode, retype] = [
            (document.getElementById("provider") as HTMLInputElement).value,
            (document.getElementById("username") as HTMLInputElement).value,
            (document.getElementById("password") as HTMLInputElement).value,
            (document.getElementById("betacode") as HTMLInputElement | null)?.value ?? "",
            (document.getElementById("retypepass") as HTMLInputElement).value,
          ];
          I.signup(provider, username, password, retype, betacode, I.phone);
        }}
      >
        Sign up
      </Button>

      <CredentialStatus I={I} />

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => I.setMode("login")}
          className="rounded text-sm text-brand-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <div className="rounded border border-border bg-card p-6 sm:p-8">{form}</div>
    </div>
  );
}

export default SignupForm;