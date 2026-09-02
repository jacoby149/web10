import React from "react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import CredentialStatus from "./CredentialStatus";

// The phone-recovery flow (Phase 2): phone → 6-digit code → pick account →
// sign in. Unauthenticated — the phone + code are the credential. Replaces the
// old broken "forgot" (setRecoveryPhone, which needed a token and never sent a
// code). design.md ui/ direction: one column, generous space, zero clutter;
// tokens only; every state designed; data-testid on every interactive element.
//
// `embedded` renders just the step content (no card chrome, no phone-step
// headline) so it can sit inside ConsentView, which supplies its own header.
// Mirrors LoginForm's embedded contract.

function CodeInput({ value, onChange, testid }: { value: string; onChange: (v: string) => void; testid: string }) {
  return (
    <input
      id={testid}
      data-testid={testid}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="••••••"
      className="h-11 w-full rounded-md border border-input bg-transparent text-center font-mono text-lg tracking-[0.5em] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function ForgotForm({ I, embedded = false }: { I: Record<string, any>; embedded?: boolean }) {
  const [code, setCode] = React.useState("");
  const [selected, setSelected] = React.useState<string>("");
  const [newPassword, setNewPassword] = React.useState("");

  const step = I.recoveryStep || "phone";
  const phone = I.recoveryPhone || "";
  const accounts: any[] = I.recoveryAccounts || [];

  const phoneStep = (
    <>
      {!embedded && (
        <>
          <h1 className="font-display text-xl font-semibold text-foreground">Recover your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your mobile number and we'll text you a code.
          </p>
        </>
      )}
      <div className={embedded ? "mt-6" : "mt-6"}>
        <Label htmlFor="recovery-phone" className="mb-1.5 block text-muted-foreground">
          Mobile number
        </Label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <PhoneInput
              inputProps={{ id: "recovery-phone", "data-testid": "recovery-phone-input" }}
              country={"us"}
              enableSearch={true}
              inputClass="!h-9 !w-full !rounded-sm !border !border-input !bg-transparent !text-sm !shadow-sm"
              buttonClass="!rounded-l-sm !border !border-input !bg-transparent"
              preferredCountries={["us", "il", "jp"]}
              value={I.phone || ""}
              onChange={(val: string) => I.setPhone(val)}
            />
          </div>
          <span className="inline-flex h-9 w-9 shrink-0 cursor-help items-center justify-center text-muted-foreground" title="web10 uses Twilio to authenticate users">
            <Info className="h-4 w-4" strokeWidth={1.5} />
          </span>
        </div>
      </div>
      <Button
        variant="brand"
        className="mt-4 w-full"
        data-testid="recovery-send-code"
        disabled={!I.phone}
        onClick={() => I.recoverRequest(I.phone)}
      >
        Send code
      </Button>
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => I.setMode("login")}
          className="rounded text-sm text-brand-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="recovery-back-to-login"
        >
          Back to log in
        </button>
      </div>
    </>
  );

  const codeStep = (
    <>
      <h1 className="font-display text-xl font-semibold text-foreground">Enter the code</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        We texted a 6-digit code to <span className="text-foreground">{phone}</span>.
      </p>
      <div className="mt-6">
        <CodeInput value={code} onChange={setCode} testid="recovery-code-input" />
      </div>
      <Button
        variant="brand"
        className="mt-4 w-full"
        data-testid="recovery-verify"
        disabled={code.length !== 6}
        onClick={() => I.recoverVerify(phone, code)}
      >
        Verify
      </Button>
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => I.setRecoveryStep("phone")}
          className="rounded text-sm text-brand-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="recovery-change-number"
        >
          Use a different number
        </button>
      </div>
    </>
  );

  const pickStep = (
    <>
      <h1 className="font-display text-xl font-semibold text-foreground">Which account?</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This number is linked to {accounts.length} account{accounts.length === 1 ? "" : "s"}. Pick one to sign in.
      </p>
      <div className="mt-6 space-y-2" data-testid="recovery-account-list">
        {accounts.map((a) => (
          <label
            key={a.username}
            className={
              "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors " +
              (selected === a.username
                ? "border-brand bg-brand-muted"
                : "border-border bg-transparent hover:bg-elevated")
            }
          >
            <input
              type="radio"
              name="recovery-account"
              value={a.username}
              checked={selected === a.username}
              onChange={() => setSelected(a.username)}
              className="h-4 w-4 accent-[var(--color-brand)]"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground" data-testid={`recovery-account-${a.username}`}>
                {a.username}
              </div>
              {a.email ? <div className="truncate text-xs text-muted-foreground">{a.email}</div> : null}
            </div>
          </label>
        ))}
      </div>
      <div className="mt-4">
        <Label htmlFor="recovery-new-password" className="mb-1.5 block text-muted-foreground">
          Set a new password <span className="text-muted-foreground/70">(optional)</span>
        </Label>
        <input
          id="recovery-new-password"
          data-testid="recovery-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Leave blank to keep your current password"
          className="h-9 w-full rounded-sm border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button
        variant="brand"
        className="mt-4 w-full"
        data-testid="recovery-sign-in"
        disabled={!selected}
        onClick={() => I.recoverComplete(phone, code, selected, newPassword || undefined)}
      >
        Sign in
      </Button>
    </>
  );

  const content = step === "code" ? codeStep : step === "pick" ? pickStep : phoneStep;

  if (embedded) {
    return (
      <div>
        {content}
        <CredentialStatus I={I} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded border border-border bg-card p-6 sm:p-8" data-testid="recovery-form">
        {content}
        <CredentialStatus I={I} />
      </div>
    </div>
  );
}

export default ForgotForm;
