import PasswordInput from "./PasswordInput";

function ReTypePass({ I }: { I: Record<string, any> }) {
  return (
    <PasswordInput
      id="retypepass"
      label="Retype password"
      autoComplete="new-password"
      testId="retype-password-input"
    />
  );
}

export default ReTypePass;
