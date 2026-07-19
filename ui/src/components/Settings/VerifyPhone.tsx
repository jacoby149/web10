import VerificationInput from 'react-verification-input';
import React from 'react';

function VerifyPhone({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(true);
  const [code, setCode] = React.useState("");

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="font-medium">Verify Phone Number</span>
        <button onClick={() => setHide(!hide)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
          <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"}></i>
        </button>
      </div>
      {!hide && (
        <div className="p-4">
          <div className="w-[600px]">
            <VerificationInput
              onChange={(val) => {
                setCode(val);
                I.verificationChange(val);
              }}
              classNames={{
                container: "container",
                character: "character",
                characterInactive: "character--inactive",
                characterSelected: "character--selected",
              }}
            />
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => I.sendCode()}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
              style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
            >
              Send Code
            </button>
            <button
              onClick={() => {
                if (code.length === 6) {
                  I.verifyCode(code);
                }
              }}
              className="px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary-600)' }}
            >
              Verify Code
            </button>
          </div>
          <p className="text-sm mt-2.5 ml-0.5" style={{ color: 'var(--color-warning)' }}>
            Verify your phone number and receive free web10 credits
          </p>
        </div>
      )}
    </div>
  );
}

export default VerifyPhone;