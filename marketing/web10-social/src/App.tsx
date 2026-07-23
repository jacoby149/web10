import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import web10SocialAdapterInit from '@/interfaces/Web10SocialAdapter';
import Layout from '@/components/Social/Layout';
import FeedScreen from '@/components/Feed/FeedScreen';
import ProfileScreen from '@/components/Bio/ProfileScreen';
import DmsScreen from '@/components/Chat/DmsScreen';
import PostComposer from '@/components/Feed/PostComposer';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ReportBug } from '@/components/shared/ReportBug';
import type { Mode } from '@/types';

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background px-6 overflow-hidden">
      {/* Animated gradient background */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/10 via-transparent to-brand-muted/20"
        aria-hidden="true"
      />
      {/* Floating ambient orbs */}
      <div
        className="pointer-events-none absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-brand/10 blur-3xl animate-float-slow"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-brand-600/10 blur-3xl animate-float-medium"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/2 right-1/3 h-32 w-32 rounded-full bg-brand-400/8 blur-2xl animate-float-fast"
        aria-hidden="true"
      />
      {/* design.md §4 — the one permitted decorative flourish: a soft brand glow behind the mark. */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-[60%] rounded-full bg-brand/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm text-center space-y-8">
        <div className="space-y-3">
          <img src="/alternative.png" alt="" className="h-14 w-14 mx-auto" aria-hidden="true" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
            web<span className="text-brand">10</span>
          </h1>
          <p className="text-muted-foreground">Your audience, actually. No shadow ban.</p>
        </div>
        <Button
          variant="brand"
          size="lg"
          data-testid="login-button"
          className="w-full h-12 text-base font-semibold"
          onClick={onLogin}
        >
          Log in
        </Button>
        <p className="text-xs text-muted-foreground">
          Powered by your own node. 100% delivery by architecture.
        </p>
      </div>
    </div>
  );
}

function ErrorFallback({ onReport, onReload }: { onReport: () => void; onReload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            The app crashed. You can report what happened or try reloading.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onReload}>
            Reload
          </Button>
          <Button variant="brand" className="flex-1" onClick={onReport}>
            Send Report
          </Button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>('login');
  const [signedIn, setSignedIn] = useState(false);
  const [adapter, setAdapter] = useState<ReturnType<typeof web10SocialAdapterInit> | null>(null);
  const [showReportBug, setShowReportBug] = useState(false);
  const [reportTrigger, setReportTrigger] = useState<'button' | 'error-boundary'>('button');

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

  const handleReportBug = useCallback((trigger: 'button' | 'error-boundary' = 'button') => {
    setReportTrigger(trigger);
    setShowReportBug(true);
  }, []);

  const handleBoundaryFallback = useCallback(
    ({ error: _err, stackTrace: _st }: { error: Error; stackTrace: string | null }) => (
      <ErrorFallback
        onReport={() => handleReportBug('error-boundary')}
        onReload={() => window.location.reload()}
      />
    ),
    [handleReportBug],
  );

  if (!signedIn) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <ErrorBoundary fallback={handleBoundaryFallback}>
      <Layout
        mode={mode}
        setMode={handleMode}
        onLogout={handleLogout}
        onReportBug={() => handleReportBug('button')}
      >
        {mode === 'feed' && (
          <>
            <PostComposer onPostCreated={() => {}} />
            <FeedScreen />
          </>
        )}
        {mode === 'my-bio' && <ProfileScreen />}
        {(mode === 'chat' || mode === 'chat-edit') && <DmsScreen />}
      </Layout>
      {showReportBug && (
        <ReportBug
          trigger={reportTrigger}
          onClose={() => setShowReportBug(false)}
        />
      )}
    </ErrorBoundary>
  );
}

export default App;