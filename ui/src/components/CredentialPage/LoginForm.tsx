import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";
import Password from "./FormInputs/Password";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";

function LoginForm({ I }: { I: Record<string, any> }) {
  return (
    <div className="w-[320px] mx-auto mt-[70px] p-6 rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <Provider I={I} />
      <Username I={I} />
      <Password I={I} />
      <div className="flex flex-wrap justify-center gap-2 mt-3">
        <button
          onClick={() => {
            I.login(
              (document.getElementById("provider") as HTMLInputElement).value,
              (document.getElementById("username") as HTMLInputElement).value,
              (document.getElementById("password") as HTMLInputElement).value,
            );
          }}
          className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--color-success)' }}
        >
          Login
        </button>
      </div>
      <div className="text-center mt-5">
        <button onClick={() => I.setMode("forgot")} className="text-sm underline" style={{ color: 'var(--color-primary-600)' }}>
          Forgot Username or Password?
        </button>
      </div>
      <div className="text-center mt-3">
        <button
          onClick={() => I.setMode("signup")}
          className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
        >
          Create A New Account
        </button>
      </div>
    </div>
  );
}

export default LoginForm;