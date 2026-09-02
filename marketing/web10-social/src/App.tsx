import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import Peer from 'peerjs';
import { Button } from '@/components/ui/button';
import { getSocialAuth } from '@/interfaces/auth';
import Layout from '@/components/Social/Layout';
import FeedScreen from '@/components/Feed/FeedScreen';
import ProfileScreen from '@/components/Bio/ProfileScreen';
import UserProfileScreen from '@/components/Bio/UserProfileScreen';
import DiscoverScreen from '@/components/Discover/DiscoverScreen';
import GroupsScreen from '@/components/Groups/GroupsScreen';
import GroupDetailScreen from '@/components/Groups/GroupDetailScreen';
import DmsScreen from '@/components/Chat/DmsScreen';
import StagingScreen from '@/components/Staging/StagingScreen';
import SettingsScreen from '@/components/Settings/SettingsScreen';
import PostComposer from '@/components/Feed/PostComposer';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ReportBug } from '@/components/shared/ReportBug';
import { getWapi, getV3Client, verifyAndRecover, Web10Error } from '@/data';
import { resolveMediaRefs } from '@/data/posts';
import { readSettings } from '@/data/settings';
import { initP2P, teardownP2P, setPeer } from '@/data/p2p';
import { trackEvent, hotjarIdentify } from '@/lib/analytics';
import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { PostRecord, MediaRecord, Visibility } from '@/data/types';

const LOG = (...args: unknown[]) => console.log('[social]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[social]', ...args);

// The manual "Log in again" message, keyed by the guard's needs_manual reason.
function sessionAlertMessage(reason: string): string {
  if (reason === 'user_not_found' || reason.startsWith('action_failed:signout')) {
    return 'This account is no longer available. Log in again to continue.';
  }
  // reauth_deferred / cooldown:reauth / action_failed:reauth / not_signed_in —
  // the session needs a re-derive; the user triggers it (or a failure will).
  return 'Your session needs to be refreshed. Log in again to continue.';
}

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

function GroupDetailRoute() {
  const { groupId } = useParams();
  return <GroupDetailScreen groupId={groupId!} />;
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
        const w = getV3Client();
        let p: PostRecord | null = null;
        let service = 'posts';
        try {
          const doc = await w.readById(postId, 'posts');
          p = { _id: doc.doc_id, text: (doc.body.text as string) || undefined, media_refs: (doc.body.media_refs as string[]) || undefined, created_at: doc.created_at, updated_at: doc.updated_at, visibility: (doc.body.visibility as Visibility) || undefined, tags: doc.tags || (doc.body.tags as string[]) || undefined };
        } catch { /* not found */ }
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
  // The access recovery's manual-fallback banner (set when a recovery is in
  // cooldown or an action failed — the loop-breaker hands the user the wheel).
  const [sessionAlert, setSessionAlert] = useState<string | null>(null);
  const navigate = useNavigate();

  // Run the access recovery: verify access and execute the verdict's recovery
  // actions (reauth / signout) + the app's own followers-group heal, honoring
  // the cooldown. On mount / after a fresh token, reauth (the popup) is
  // deferred to an actual failure; the safe local actions (heal, signout) still
  // run.
  const runAccessRecovery = useCallback((allowReauth: boolean) => {
    verifyAndRecover({ allowReauth })
      .then((res) => {
        if (res.outcome === 'needs_manual') {
          setSessionAlert(sessionAlertMessage(res.reason));
        } else if (res.outcome === 'recovered') {
          setSessionAlert(null);
        }
      })
      .catch((e) => LOG_ERR('access recovery failed:', e));
  }, []);

  useEffect(() => {
    // D42 (D46): the auth seam talks to the SDK directly — the real consent
    // popup, the same flow the demos run. isSignedIn is cookie-first, so a
    // return visit restores the session with no popup; authListen (D45-
    // deduped) fires on the one-tap login.
    const auth = getSocialAuth();
    LOG('app mount — isSignedIn:', auth.isSignedIn());
    if (auth.isSignedIn()) {
      setSignedIn(true);
      runAccessRecovery(false);
    }
    auth.authListen(() => {
      setSignedIn(true);
      setSessionAlert(null);
      trackEvent('login');
      const who = auth.readToken();
      if (who) hotjarIdentify(who.username);
      // The sign-in (or a reauth) IS the recovery — no need to re-verify here.
      // Verifying during the sign-in transition hits a "Failed to fetch" (the
      // session is mid-handoff). The mount + reactive-failure paths cover it.
    });

    // The recovery's terminal signout (user not found) clears the cookie and
    // signals us to show the login screen.
    const onSignedOut = () => {
      setSignedIn(false);
      setSessionAlert(null);
    };
    window.addEventListener('session:signed-out', onSignedOut);

    // Reactive path: when a data op fails with an auth-class error (401/403),
    // re-ask the oracle (verifyAndRecover) and act on the definitive verdict —
    // the client never guesses from the status code. The recovery's cooldown
    // prevents a loop, and a transient 403 (a deploy window) yields an
    // inconclusive verdict → no action (definite-NO-vs-UNKNOWN).
    const onAuthError = (e: Event) => {
      const err = e instanceof PromiseRejectionEvent ? e.reason : (e as ErrorEvent).error;
      if (err instanceof Web10Error && (err.status === 401 || err.status === 403)) {
        LOG('reactive session check — auth-class error', err.status, err.details);
        runAccessRecovery(true);
      }
    };
    window.addEventListener('unhandledrejection', onAuthError);
    window.addEventListener('error', onAuthError);

    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ username: string; provider: string }>;
      navigate(`/u/${customEvent.detail.username}`, { state: { provider: customEvent.detail.provider } });
    };
    window.addEventListener('navigate-user-profile', handler);
    return () => {
      window.removeEventListener('session:signed-out', onSignedOut);
      window.removeEventListener('unhandledrejection', onAuthError);
      window.removeEventListener('error', onAuthError);
      window.removeEventListener('navigate-user-profile', handler);
    };
  }, [navigate, runAccessRecovery]);

  // P2P lifecycle (real-time messages): open the peer on sign-in when the
  // user's `p2pEnabled` setting is on, tear it down on sign-out. Re-applies
  // when the toggle changes (SettingsScreen fires `settings-changed`). The
  // peer connection IS the presence — online while open, offline when torn
  // down (opted out or not signed in).
  const applyP2P = useCallback(async () => {
    const auth = getSocialAuth();
    if (!auth.isSignedIn()) {
      teardownP2P();
      return;
    }
    try {
      const s = await readSettings();
      LOG('applyP2P — p2pEnabled:', s.p2pEnabled);
      if (s.p2pEnabled) {
        setPeer(Peer);
        await initP2P();
      } else {
        teardownP2P();
      }
    } catch (e) {
      LOG_ERR('applyP2P — failed:', e);
    }
  }, []);

  useEffect(() => {
    if (signedIn) {
      applyP2P();
    } else {
      teardownP2P();
    }
    const onSettingsChanged = () => {
      if (getSocialAuth().isSignedIn()) applyP2P();
    };
    window.addEventListener('settings-changed', onSettingsChanged);
    return () => {
      window.removeEventListener('settings-changed', onSettingsChanged);
    };
  }, [signedIn, applyP2P]);

  function handleLogin() {
    getSocialAuth().login();
  }

  function handleLogout() {
    getSocialAuth().signOut();
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
      {sessionAlert && (
        <div
          role="alert"
          data-testid="session-alert"
          className="flex items-center justify-between gap-3 px-4 py-2.5 bg-danger-muted border-b border-danger/30 text-sm text-danger"
        >
          <span>{sessionAlert}</span>
          <Button size="sm" variant="brand" data-testid="session-relogin-button" onClick={handleLogin}>
            Log in again
          </Button>
        </div>
      )}
      <Routes>
        <Route element={<Layout onLogout={handleLogout} onReportBug={() => handleReportBug('button')} />}>
          <Route path="/feed" element={<FeedRoute onAuthorClick={handleAuthorClick} />} />
          <Route path="/discover" element={<DiscoverScreen />} />
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/groups/:groupId" element={<GroupDetailRoute />} />
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