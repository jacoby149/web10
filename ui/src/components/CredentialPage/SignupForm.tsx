import "react-phone-input-2/lib/bootstrap.css";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";
import Password from "./FormInputs/Password";
import ReTypePass from "./FormInputs/ReTypePass";
import Phone from "./FormInputs/Phone";
import BetaCode from "./FormInputs/BetaCode";

function SignupForm({ I }: { I: Record<string, any> }) {
  return (
    <div className="w-[320px] mx-auto mt-[70px] p-6 rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <Provider I={I} />
      <Username I={I} />
      <Password I={I} />
      <div>
        <ReTypePass I={I} />
        <Phone I={I} />
        <BetaCode I={I} />
      </div>
      <div className="flex justify-center mt-3">
        <button
          onClick={() => {
            I.setMode("appstore");
            const [provider, username, password, betacode, retype] = [
              (document.getElementById("provider") as HTMLInputElement).value,
              (document.getElementById("username") as HTMLInputElement).value,
              (document.getElementById("password") as HTMLInputElement).value,
              (document.getElementById("betacode") as HTMLInputElement).value,
              (document.getElementById("retypepass") as HTMLInputElement).value,
            ];
            I.signup(provider, username, password, retype, betacode);
          }}
          className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
        >
          Signup
        </button>
      </div>
      <div className="text-center mt-5">
        <button onClick={() => I.setMode("login")} className="text-sm underline" style={{ color: 'var(--color-primary-600)' }}>
          Already have an account?
        </button>
      </div>
    </div>
  );
}

export default SignupForm;