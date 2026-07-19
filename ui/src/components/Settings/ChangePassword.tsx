import ConfirmationPass from '../CredentialPage/FormInputs/ConfirmationPass';
import NewPassword from './FormInputs/NewPassword';
import ReTypeNewPass from './FormInputs/ReTypeNewPass';
import React from 'react';

function ChangePass({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(true);
  const [newPass, setNewPass] = React.useState("");
  const [retypeNewPass, setRetypeNewPass] = React.useState("");
  const [currentPass, setCurrentPass] = React.useState("");

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="font-medium">Change Password</span>
        <button onClick={() => setHide(!hide)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
          <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"}></i>
        </button>
      </div>
      {!hide && (
        <div className="p-4">
          <div className="w-[300px]">
            <NewPassword I={I} value={newPass} onChange={setNewPass} />
            <ReTypeNewPass I={I} value={retypeNewPass} onChange={setRetypeNewPass} />
            <ConfirmationPass I={I} value={currentPass} onChange={setCurrentPass} />
          </div>
          <button
            onClick={() => I.changePassword(currentPass, newPass, retypeNewPass)}
            className="mt-2.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
          >
            Change Password
          </button>
        </div>
      )}
    </div>
  );
}

export default ChangePass;