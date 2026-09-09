import PasswordInput from "./PasswordInput";

function Password({ I }: { I: Record<string, any> }) {
  return (
    <PasswordInput
      id="password"
      label="Password"
      autoComplete="current-password"
      testId="password-input"
    />
  );
}

export default Password;
