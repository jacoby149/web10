import Branding from '../shared/Branding';
import MoreMenu from '../shared/MoreMenu';
import LoginForm from './LoginForm';
import ForgotForm from './ForgotForm';
import SignupForm from './SignupForm';
import { useCredentialEntry } from '@/lib/useCredentialEntry';

// Keep credentials in one column without the signed-in account chrome.
function CredentialForm({ I }: { I: Record<string, any> }) {
  switch (I.mode) {
    case "login": return <LoginForm I={I} />;
    case "signup": return <SignupForm I={I} />;
    case "forgot": return <ForgotForm I={I} />;
    default: return <LoginForm I={I} />;
  }
}

function CredentialPage({ I }: { I: Record<string, any> }) {
  const entry = useCredentialEntry(I);
  return (
    <div
      className="flex min-h-dvh flex-col items-center bg-background text-foreground"
      data-testid="credential-page"
    >
      {/* The More menu keeps the old sidebar's ecosystem links reachable from
          the signed-out header too — desktop only, like the old sidebar. */}
      <header className="hub-header flex h-14 w-full shrink-0 items-center justify-between gap-2 px-4 sm:px-6">
        <Branding I={I} size="sm" tagline={false} hubHeader />
        <MoreMenu />
      </header>
      <div className="flex w-full flex-1 items-center justify-center px-5 py-8 sm:py-10">
        <CredentialForm I={entry} />
      </div>
      <a href="/?mode=appearance" className="mb-6 inline-flex min-h-11 items-center rounded px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Appearance</a>
    </div>
  );
}

export default CredentialPage;
