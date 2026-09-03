import React from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import CredentialStatus from "./CredentialStatus";

// Contact-anchored auth (D61): contact (phone OR email) → 6-digit code → pick
// an account on that contact (or create a new username) → sign in.
// Unauthenticated — the contact + code are the credential. Sign-up, sign-in,
// and password-change are the same flow. design.md ui/ direction: one column,
// generous space, zero clutter; tokens only; every state designed; data-testid
// on every interactive element.
//
// `embedded` renders just the step content (no card chrome, no contact-step
// headline) so it can sit inside ConsentView, which supplies its own header.
// Mirrors LoginForm's embedded contract.

const NEW_ACCOUNT = "__new__";

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
  const [newUsername, setNewUsername] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");

  const step = I.recoveryStep || "contact";
  const contact = I.recoveryContact || "";
  const accounts: any[] = I.recoveryAccounts || [];
  const isEmail = contact.includes("@");

  // Creating a new account: either the user picked the "new" option, or there
  // are no accounts on the contact (the sign-up path).
  const creating = selected === NEW_ACCOUNT || (accounts.length === 0 && step === "pick");
  const submitUsername = creating ? newUsername : selected;
  const canSubmit = creating ? newUsername.trim().length > 0 : !!selected;

  const contactStep = (
    <>
      {!embedded && (
        <>
          <h1 className="font-display text-xl font-semibold text-foreground">Sign in or create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your phone number or email and we'll send you a code.
          </p>
        </>
      )}
      <div className="mt-6">
        <Label htmlFor="recovery-contact" className="mb-1.5 block text-muted-foreground">
          Phone number or email
        </Label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              id="recovery-contact"
              data-testid="recovery-contact-input"
              type="text"
              inputMode={isEmail ? "email" : "tel"}
              autoComplete="off"
              value={I.recoveryContact || ""}
              onChange={(e) => I.setRecoveryContact(e.target.value)}
              placeholder="+1 555 123 4567 or you@example.com"
              className="h-9 w-full rounded-sm border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        disabled={!I.recoveryContact || !I.recoveryContact.trim()}
        onClick={() => I.recoverRequest(I.recoveryContact.trim())}
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
        We sent a 6-digit code to <span className="text-foreground">{contact}</span>.
      </p>
      <div className="mt-6">
        <CodeInput value={code} onChange={setCode} testid="recovery-code-input" />
      </div>
      <Button
        variant="brand"
        className="mt-4 w-full"
        data-testid="recovery-verify"
        disabled={code.length !== 6}
        onClick={() => I.recoverVerify(contact, code)}
      >
        Verify
      </Button>
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => I.setRecoveryStep("contact")}
          className="rounded text-sm text-brand-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="recovery-change-contact"
        >
          Use a different phone or email
        </button>
      </div>
    </>
  );

  const pickStep = (
    <>
      <h1 className="font-display text-xl font-semibold text-foreground">
        {accounts.length > 0 ? "Which account?" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {accounts.length > 0
          ? `This ${isEmail ? "email" : "number"} is linked to ${accounts.length} account${accounts.length === 1 ? "" : "s"}. Pick one to sign in.`
          : `No account on this ${isEmail ? "email" : "number"} yet — pick a username to get started.`}
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
        <label
          className={
            "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors " +
            (creating
              ? "border-brand bg-brand-muted"
              : "border-border bg-transparent hover:bg-elevated")
          }
        >
          <input
            type="radio"
            name="recovery-account"
            value={NEW_ACCOUNT}
            checked={creating}
            onChange={() => setSelected(NEW_ACCOUNT)}
            className="h-4 w-4 accent-[var(--color-brand)]"
            data-testid="recovery-new-account"
          />
          <div className="min-w-0 flex-1 text-sm font-medium text-foreground">New account</div>
        </label>
      </div>
      {creating && (
        <div className="mt-4">
          <Label htmlFor="recovery-new-username" className="mb-1.5 block text-muted-foreground">
            Username
          </Label>
          <input
            id="recovery-new-username"
            data-testid="recovery-new-username"
            type="text"
            autoComplete="off"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
            placeholder="lowercase, digits, or hyphens"
            className="h-9 w-full rounded-sm border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
      <div className="mt-4">
        <Label htmlFor="recovery-new-password" className="mb-1.5 block text-muted-foreground">
          {creating ? "Set a password" : "Set a new password"}{" "}
          <span className="text-muted-foreground/70">(optional)</span>
        </Label>
        <input
          id="recovery-new-password"
          data-testid="recovery-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={creating ? "Create a password" : "Leave blank to keep your current password"}
          className="h-9 w-full rounded-sm border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button
        variant="brand"
        className="mt-4 w-full"
        data-testid="recovery-sign-in"
        disabled={!canSubmit}
        onClick={() => I.recoverComplete(submitUsername, newPassword || undefined)}
      >
        {creating ? "Create account" : "Sign in"}
      </Button>
    </>
  );

  const content = step === "code" ? codeStep : step === "pick" ? pickStep : contactStep;

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
