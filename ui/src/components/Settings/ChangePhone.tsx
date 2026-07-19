import Phone from '../CredentialPage/FormInputs/Phone';
import ConfirmationPass from '../CredentialPage/FormInputs/ConfirmationPass';
import React from 'react';

function ChangePhone({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(true);
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="font-medium">Change Phone Number</span>
        <button onClick={() => setHide(!hide)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
          <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"}></i>
        </button>
      </div>
      {!hide && (
        <div className="p-4">
          <div className="w-[300px]">
            <Phone I={I} value={phone} onChange={setPhone} />
            <ConfirmationPass I={I} value={password} onChange={setPassword} />
          </div>
          <button
            onClick={() => I.changePhoneNumber(password, phone)}
            className="mt-2.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
          >
            Change Phone Number
          </button>
        </div>
      )}
    </div>
  );
}

export default ChangePhone;