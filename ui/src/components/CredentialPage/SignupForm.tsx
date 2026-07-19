import "react-phone-input-2/lib/bootstrap.css";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";
import Password from "./FormInputs/Password";
import ReTypePass from "./FormInputs/ReTypePass";
import Phone from "./FormInputs/Phone";
import BetaCode from "./FormInputs/BetaCode";
import { Button } from '@/components/ui/button';

function SignupForm({ I }: { I: Record<string, any> }) {
  return (
    <div className="w-full max-w-sm">
      <div className="rounded border border-border bg-card p-6 sm:p-8">
        <h1 className="font-display text-xl font-semibold text-foreground">Create your node</h1>
        <p className="mt-1 text-sm text-muted-foreground">Own your data from the first record.</p>

        <div className="mt-6 space-y-1">
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
            I.setMode("appstore");
            const [provider, username, password, betacode, retype] = [
              (document.getElementById("provider") as HTMLInputElement).value,
              (document.getElementById("username") as HTMLInputElement).value,
              (document.getElementById("password") as HTMLInputElement).value,
              (document.getElementById("betacode") as HTMLInputElement | null)?.value ?? "",
              (document.getElementById("retypepass") as HTMLInputElement).value,
            ];
            I.signup(provider, username, password, retype, betacode);
          }}
        >
          Sign up
        </Button>

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
      </div>
    </div>
  );
}

export default SignupForm;