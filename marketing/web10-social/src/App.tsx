import { useEffect, useState, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import web10SocialAdapterInit from '@/interfaces/Web10SocialAdapter';
import Layout from '@/components/Social/Layout';
import FeedScreen from '@/components/Feed/FeedScreen';
import ProfileScreen from '@/components/Bio/ProfileScreen';
import UserProfileScreen from '@/components/Bio/UserProfileScreen';
import DiscoverScreen from '@/components/Discover/DiscoverScreen';
import DmsScreen from '@/components/Chat/DmsScreen';
import StagingScreen from '@/components/Staging/StagingScreen';
import SettingsScreen from '@/components/Settings/SettingsScreen';
import PostComposer from '@/components/Feed/PostComposer';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ReportBug } from '@/components/shared/ReportBug';
import { getWapi } from '@/data/wapi';
import { registerDefaultSchemas } from '@/data/feed';
import { resolveMediaRefs } from '@/data/posts';
import { trackEvent } from '@/lib/analytics';
import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { PostRecord, MediaRecord } from '@/data/types';

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background px-6 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/10 via-transparent to-brand-muted/20"
        aria-hidden="true"
      />
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
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-[60%] rounded-full bg-brand/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm text-center space-y-8">
        <div className="space-y-3">
          <img src="/keys-mark.png" alt="" className="h-14 w-14 mx-auto" aria-hidden="true" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
            web<span className="text-brand">10</span>
          </h1>
          <p className="text-muted-foreground">Your audience. No shadow ban.</p>
        </div>
        <Button
          variant="brand"
          size="lg"
          data-testid="login-button"
          className="w-full h-12 text-base font-semibold"
          onClick={onLogin}
        >
          Log in or create your account
        </Button>
        <p className="text-xs text-muted-foreground">
          Log in or create your account — one step.
        </p>
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

function UserProfileRoute() {
  const { username } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const provider = location.state?.provider || getWapi().readToken()?.provider || '';

  return (
    <UserProfileScreen
      username={username!}
      provider={provider}
      onBack={() => navigate(-1)}
    />
  );
}

function UserProfilePostLinkRoute() {
  const { username, postId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const provider = location.state?.provider || getWapi().readToken()?.provider || '';
  const highlightedCommentId = searchParams.get('comment') || undefined;
  const [post, setPost] = useState<PostRecord | null>(null);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getWapi().readToken();
        if (!token) return;
        // Try reading from public_posts first, then posts
        const wapi = getWapi();
        let p: PostRecord | null = null;
        let service = 'public_posts';
        for (const s of ['public_posts', 'posts']) {
          const results = await wapi.read<PostRecord>(s, { _id: postId });
          if (results[0]) {
            p = results[0];
            service = s;
            break;
          }
        }
        if (!cancelled && p) {
          setPost(p);
          if (p.media_refs?.length) {
            const media = await resolveMediaRefs(
              p.media_refs,
              { username: username!, provider: provider || token.provider },
              username === token.username ? 'media' : 'public_media',
            );
            const flat: Record<string, MediaRecord> = {};
            for (const m of media) {
              if (m._id) flat[m._id] = m;
            }
            if (!cancelled) setMediaMap(flat);
          }
        }
      } catch (e) {
        if (!cancelled) console.error('Failed to load post:', e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [username, postId, provider]);

  if (loading) {
    return (
      <UserProfileScreen
        username={username!}
        provider={provider}
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <>
      <UserProfileScreen
        username={username!}
        provider={provider}
        onBack={() => navigate(-1)}
      />
      {post && (
        <PostLightbox
          post={post}
          mediaMap={mediaMap}
          onClose={() => navigate(`/u/${username}`)}
          postAuthor={username}
          postService={post._id ? 'public_posts' : undefined}
          isOwner={false}
          highlightedCommentId={highlightedCommentId}
        />
      )}
    </>
  );
}

// /feed route: composing a post bumps `version`, which remounts FeedScreen
// so a fresh post shows up immediately instead of only after a manual
// refresh (the post is delivered to the author's own inbox on create).
function FeedRoute({ onAuthorClick }: { onAuthorClick: (username: string, provider: string) => void }) {
  const [version, setVersion] = useState(0);
  return (
    <>
      <PostComposer onPostCreated={() => {
        setVersion((v) => v + 1);
        trackEvent('post_created');
      }} />
      <FeedScreen key={version} onAuthorClick={onAuthorClick} />
    </>
  );
}

function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [showReportBug, setShowReportBug] = useState(false);
  const [reportTrigger, setReportTrigger] = useState<'button' | 'error-boundary'>('button');
  const adapterRef = useRef<ReturnType<typeof web10SocialAdapterInit> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const a = web10SocialAdapterInit();
    adapterRef.current = a;

    if (a.isSignedIn()) {
      setSignedIn(true);
      registerDefaultSchemas().catch(() => {});
    }

    a.authListen(() => {
      setSignedIn(true);
      registerDefaultSchemas().catch(() => {});
      trackEvent('login');
    });

    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ username: string; provider: string }>;
      navigate(`/u/${customEvent.detail.username}`, { state: { provider: customEvent.detail.provider } });
    };
    window.addEventListener('navigate-user-profile', handler);
    return () => {
      window.removeEventListener('navigate-user-profile', handler);
    };
  }, []);

  function handleLogin() {
    adapterRef.current?.login();
  }

  function handleLogout() {
    adapterRef.current?.signOut();
    setSignedIn(false);
  }

  const handleAuthorClick = useCallback((username: string, provider: string) => {
    navigate(`/u/${username}`, { state: { provider } });
  }, [navigate]);

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
      <Routes>
        <Route element={<Layout onLogout={handleLogout} onReportBug={() => handleReportBug('button')} />}>
          <Route path="/feed" element={<FeedRoute onAuthorClick={handleAuthorClick} />} />
          <Route path="/discover" element={<DiscoverScreen />} />
          <Route path="/messages/*" element={<DmsScreen />} />
          <Route path="/profile" element={<ProfileRedirectRoute />} />
          <Route path="/u/:username" element={<UserProfileRoute />} />
          <Route path="/u/:username/p/:postId" element={<UserProfilePostLinkRoute />} />
          <Route path="/staging" element={<StagingScreen />} />
          <Route path="/settings" element={<SettingsScreen onLogout={handleLogout} onReportBug={() => handleReportBug('button')} />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Route>
      </Routes>
      {showReportBug && (
        <ReportBug
          trigger={reportTrigger}
          onClose={() => setShowReportBug(false)}
        />
      )}
    </ErrorBoundary>
  );
}

function ProfileRedirectRoute() {
  const token = getWapi().readToken();
  if (!token) {
    return <Navigate to="/feed" replace />;
  }
  return <Navigate to={`/u/${token.username}`} replace state={{ provider: token.provider }} />;
}

export default App;