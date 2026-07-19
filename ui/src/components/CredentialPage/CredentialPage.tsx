import Branding from '../shared/Branding';
import LoginForm from './LoginForm';
import ForgotForm from './ForgotForm';
import SignupForm from './SignupForm';

// Auth screens are the narrative surface ("this is your node") — design.md
// direction for ui/: one column, generous space, zero clutter. No
// TopBar/SideBar app-shell chrome here; just a centered brand mark and
// the form. (Studio/Contracts keep the full shell; this page doesn't.)
function CredentialForm({ I }: { I: Record<string, any> }) {
  switch (I.mode) {
    case "login": return <LoginForm I={I} />;
    case "signup": return <SignupForm I={I} />;
    case "forgot": return <ForgotForm I={I} />;
    default: return <LoginForm I={I} />;
  }
}

function CredentialPage({ I }: { I: Record<string, any> }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center bg-background text-foreground"
      data-testid="credential-page"
    >
      <div className="flex justify-center px-6 pt-12">
        <Branding I={I} />
      </div>
      <div className="flex w-full flex-1 items-center justify-center px-4 py-10">
        <CredentialForm I={I} />
      </div>
    </div>
  );
}

export default CredentialPage;