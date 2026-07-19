import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import LoginForm from './LoginForm';
import ForgotForm from './ForgotForm';
import SignupForm from './SignupForm';

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
    <div className={`min-h-screen flex flex-col ${I.theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 flex items-center justify-center p-6">
          <CredentialForm I={I} />
        </div>
      </div>
    </div>
  );
}

export default CredentialPage;