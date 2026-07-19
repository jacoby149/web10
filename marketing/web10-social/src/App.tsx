import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import web10SocialAdapterInit from '@/interfaces/Web10SocialAdapter';
import Layout from '@/components/Social/Layout';
import FeedScreen from '@/components/Feed/FeedScreen';
import ProfileScreen from '@/components/Bio/ProfileScreen';
import DmsScreen from '@/components/Chat/DmsScreen';
import PostComposer from '@/components/Feed/PostComposer';
import type { Mode } from '@/types';

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6">
      <div className="w-full max-w-sm text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            web<span className="text-brand">10</span>
          </h1>
          <p className="text-muted-foreground">Your social network. Your data. Your rules.</p>
        </div>
        <Button
          variant="brand"
          size="lg"
          className="w-full h-12 text-base font-semibold"
          onClick={onLogin}
        >
          Log in
        </Button>
        <p className="text-xs text-muted-foreground">
          Powered by your own node. No shadow bans. 100% delivery.
        </p>
      </div>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>('login');
  const [signedIn, setSignedIn] = useState(false);
  const [adapter, setAdapter] = useState<ReturnType<typeof web10SocialAdapterInit> | null>(null);

  useEffect(() => {
    const a = web10SocialAdapterInit();
    setAdapter(a);

    if (a.isSignedIn()) {
      setSignedIn(true);
      setMode('feed');
    } else {
      a.authListen(() => {
        setSignedIn(true);
        setMode('feed');
      });
    }
  }, []);

  function handleLogin() {
    adapter?.login();
  }

  function handleLogout() {
    adapter?.signOut();
    setSignedIn(false);
    setMode('login');
  }

  function handleMode(m: Mode) {
    setMode(m);
  }

  if (!signedIn) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <Layout mode={mode} setMode={handleMode} onLogout={handleLogout}>
      {mode === 'feed' && (
        <>
          <PostComposer onPostCreated={() => {}} />
          <FeedScreen />
        </>
      )}
      {mode === 'my-bio' && <ProfileScreen />}
      {(mode === 'chat' || mode === 'chat-edit') && <DmsScreen />}
    </Layout>
  );
}

export default App;