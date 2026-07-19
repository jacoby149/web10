import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";
import Provider from "./FormInputs/Provider";
import Phone from "./FormInputs/Phone";

function ForgotForm({ I }: { I: Record<string, any> }) {
  return (
    <div className="w-[320px] mx-auto mt-[70px] p-6 rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
        Please enter your web10 provider and mobile number to recover your account.
      </p>
      <Provider I={I} />
      <Phone I={I} />
      <div className="flex justify-center gap-2 mt-3" style={{ margin: '5px' }}>
        <button
          onClick={() => I.isAuth ? I.setMode("login") : I.setMode("appstore")}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          Cancel
        </button>
        <button
          onClick={() => {
            const provider = (document.getElementById("provider") as HTMLInputElement).value;
            I.recover(provider, I.phone);
          }}
          className="px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--color-info)' }}
        >
          Recover Account
        </button>
      </div>
    </div>
  );
}

export default ForgotForm;