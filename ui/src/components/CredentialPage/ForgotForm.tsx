import "react-phone-input-2/lib/bootstrap.css";
import Provider from "./FormInputs/Provider";
import Phone from "./FormInputs/Phone";
import CredentialStatus from "./CredentialStatus";
import { Button } from '@/components/ui/button';

// `embedded` renders just the fields + actions (no card chrome, no headline)
// so it can sit inside another surface — e.g. ConsentView, which supplies its
// own header. Cancel then returns to the embedded login instead of the app
// store. Mirrors LoginForm's embedded contract.
function ForgotForm({ I, embedded = false }: { I: Record<string, any>; embedded?: boolean }) {
  const form = (
    <>
      {!embedded && (
        <>
          <h1 className="font-display text-xl font-semibold text-foreground">Recover your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your web10 provider and mobile number to recover your account.
          </p>
        </>
      )}

      <div className={embedded ? "space-y-1" : "mt-6 space-y-1"}>
        <Provider I={I} />
        <Phone I={I} />
      </div>

      <div className="mt-2 flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => (embedded || I.isAuthenticated()) ? I.setMode("login") : I.setMode("appstore")}
          data-testid="forgot-cancel"
        >
          Cancel
        </Button>
        <Button
          variant="brand"
          className="flex-1"
          data-testid="forgot-submit"
          onClick={() => {
            const provider = (document.getElementById("provider") as HTMLInputElement).value;
            I.recover(provider, I.phone);
          }}
        >
          Recover account
        </Button>
      </div>

      <CredentialStatus I={I} />
    </>
  );

  if (embedded) return <div>{form}</div>;

  return (
    <div className="w-full max-w-sm">
      <div className="rounded border border-border bg-card p-6 sm:p-8">{form}</div>
    </div>
  );
}

export default ForgotForm;
