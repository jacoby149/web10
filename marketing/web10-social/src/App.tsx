import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import Peer from 'peerjs';
import { Button } from '@/components/ui/button';
import { getSocialAuth } from '@/interfaces/auth';
import Layout from '@/components/Social/Layout';
import JoinScreen from '@/components/Join/JoinScreen';
import PostsScreen from '@/components/Feed/PostsScreen';
import ProfileScreen from '@/components/Bio/ProfileScreen';
import UserProfileScreen from '@/components/Bio/UserProfileScreen';
import SavedCollectionScreen from '@/components/Bio/SavedCollectionScreen';
import ProfilePinsScreen from '@/components/Bio/ProfilePinsScreen';
import UserFollowListScreen from '@/components/Bio/UserFollowListScreen';
import DiscoverScreen from '@/components/Discover/DiscoverScreen';
import WatchScreen from '@/components/Watch/WatchScreen';
import ShortsScreen from '@/components/Shorts/ShortsScreen';
import MusicScreen from '@/components/Music/MusicScreen';
import MusicPlayer from '@/components/Music/MusicPlayer';
import { MusicProvider } from '@/context/MusicContext';
import GroupsScreen from '@/components/Groups/GroupsScreen';
import GroupDetailScreen from '@/components/Groups/GroupDetailScreen';
import DmsScreen from '@/components/Chat/DmsScreen';
import NotificationsScreen from '@/components/Notifications/NotificationsScreen';
import SettingsScreen from '@/components/Settings/SettingsScreen';
import AppearanceScreen from '@/components/Settings/Appearance';
import MonetizationScreen from '@/components/Monetization/MonetizationScreen';
import StorefrontScreen from '@/components/Monetization/StorefrontScreen';
import NodeSettingsScreen from '@/components/NodeSettings/NodeSettingsScreen';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ReportBug } from '@/components/shared/ReportBug';
import { Toaster, toast } from '@/components/shared/Toast';
import { InstallPrompt } from '@/components/shared/InstallPrompt';
import { getWapi, getV3Client, verifyAndRecover, Web10Error, ensureProfile } from '@/data';
import { resolveMediaRefs, resolvePostAuthors } from '@/data/posts';
import { readSettings } from '@/data/settings';
import { initP2P, teardownP2P, setPeer } from '@/data/p2p';
import { initNotifications, teardownNotifications } from '@/data/notifications';
import { initMessagesUnread, teardownMessagesUnread } from '@/data/messagesUnread';
import { trackEvent, identifyAnalytics, resetAnalytics, trackProductSession } from '@/lib/analytics';
import { PostLightbox } from '@/components/Bio/PostLightbox';
import { RepostProvider } from '@/context/RepostContext';
import { ComposerProvider } from '@/context/ComposerContext';
import { UploadProvider, UploadsScreen, UploadDock } from '@/context/UploadContext';
import { SaveProvider } from '@/context/SaveContext';
import { NewPostSheet } from '@/components/Feed/NewPostSheet';
import { SaveSheet } from '@/components/Feed/SaveSheet';
import type { PostRecord, MediaRecord, ResolvedMediaRef } from '@/data/types';
import { fromResolvedMediaRef, fromV3DocToPost } from '@/data/types';

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

// D88: a saved collection's deep-linkable detail view — /u/:username/saved/:collectionId
// (the collectionId is the group_id, URL-encoded — the group-detail idiom). The
// URL holds which collection is open (the "address bar is part of the product"
// rule). The owner sees the per-item remove + the visibility toggle; a visitor
// sees a read-only wall (a private collection's read 403s → the error state).
function SavedCollectionRoute() {
  const { username } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const provider = location.state?.provider || getWapi().readToken()?.provider || '';

  return (
    <SavedCollectionScreen
      username={username!}
      provider={provider}
      onBack={() => navigate(-1)}
    />
  );
}

// Profile pins (profile-pins.md): the owner's pin-list manage screen —
// /u/:username/pins. The URL holds the screen (refresh-safe, back/forward
// work); the screen itself guards owner-only (a visitor is bounced back to
// the profile — pin management is the owner's surface, not a read view).
function ProfilePinsRoute() {
  const { username } = useParams();
  return <ProfilePinsScreen key={username} />;
}

// D80: the profile's clickable Following / Followers counts → dedicated list
// screens (the social graph is a property of a person, so it lives here, not on
// a discovery surface). Deep-linkable: /u/:username/followers + /following.
// The "Back" button returns to the profile (the operator: "back to profile").
function UserFollowersRoute() {
  return <UserFollowListScreen kind="followers" />;
}

function UserFollowingRoute() {
  return <UserFollowListScreen kind="following" />;
}

function GroupDetailRoute() {
  const { groupId } = useParams();
  return <GroupDetailScreen groupId={groupId!} />;
}

// A group collection's deep-linkable detail view — /groups/:groupId/saved/:collectionId
// (the collectionId is the group_id, URL-encoded — the group-detail idiom). The
// group's manager sees the per-item remove + the visibility toggle; a visitor
// sees a read-only wall (a private collection's read 403s → the error state).
// Reuses SavedCollectionScreen with the group-owner check (owner = can manage
// the group, not the profile's username).
function GroupSavedCollectionRoute() {
  const { groupId } = useParams();
  const navigate = useNavigate();

  return (
    <SavedCollectionScreen
      groupId={groupId ? decodeURIComponent(groupId) : undefined}
      onBack={() => navigate(-1)}
    />
  );
}

function UserProfilePostLinkRoute() {
  const { username, postId, groupId } = useParams();
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
        // Anon-capable: the node's read-by-id is `user_or_anon` and resolves
        // media server-side (fresh presigned URLs + HLS), so a public post's
        // permalink renders for a signed-out visitor — the marketing site's
        // video click lands here and must show the video, not a login wall.
        const w = getV3Client();
        let p: PostRecord | null = null;
        try {
          const doc = await w.readById(postId, 'posts');
          p = (await resolvePostAuthors([fromV3DocToPost(doc)]))[0];
        } catch { /* not found */ }
        if (!cancelled && p) {
          setPost(p);
          const refIds: (string | ResolvedMediaRef)[] = [...(p.media_refs || [])];
          // A product (D89) carries its photo in `pics` (bare doc_id strings),
          // not `media_refs` — resolve the first pic so the product card can
          // show it. Same owner-scoped path as the post's own media.
          const firstPic = p.product?.pics?.[0];
          if (firstPic && !refIds.some((r) => (typeof r === 'string' ? r : r.doc_id) === firstPic)) {
            refIds.push(firstPic);
          }
          if (refIds.length) {
            const flat: Record<string, MediaRecord> = {};
            if (token) {
              // Signed-in: the cross-user `public_media` path mints fresh
              // presigned URLs (the owner's own media uses the `media` service).
              const uploader = p.posted_by || p.author_username || username!;
              const media = await resolveMediaRefs(
                refIds,
                { username: uploader, provider: provider || token.provider },
                uploader === token.username ? 'media' : 'public_media',
              );
              for (const m of media) {
                if (m._id) flat[m._id] = m;
              }
            } else {
              // Anon: build the map from the inline resolved refs the node
              // returned (no token to re-presign with). A product's pics are
              // bare doc_ids the anon path can't presign — the card falls back
              // to no photo (the product's name + link still render).
              for (const r of refIds) {
                if (typeof r === 'string') continue;
                const id = r.doc_id || '';
                if (id) flat[id] = fromResolvedMediaRef(r);
              }
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
  }, [username, postId, provider, groupId]);

  const authorGroup = post?.author_key?.includes('/groups/') ? post.author_key : groupId;

  if (loading) {
    return (
      groupId ? <GroupDetailScreen groupId={groupId} /> :
      <UserProfileScreen
        username={username!}
        provider={provider}
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <>
      {authorGroup ? <GroupDetailScreen groupId={authorGroup} /> : <UserProfileScreen
        username={username!}
        provider={provider}
        onBack={() => navigate(-1)}
      />}
      {post && (
        <PostLightbox
          post={post}
          mediaMap={mediaMap}
          onClose={() => navigate(authorGroup ? `/groups/${encodeURIComponent(authorGroup)}` : `/u/${username}`)}
          postAuthor={username}
          postService={post._id ? 'public_posts' : undefined}
          highlightedCommentId={highlightedCommentId}
        />
      )}
    </>
  );
}

// /feed route: the merged Posts screen (Feed + Hot Gossip, the X/Threads
// model — one destination, a "Discover | Following" tab row inside). The
// composer + feed remount on post/repost create (the version-bump idiom,
// lifted into PostsScreen). Repost (reposts.md): the repeat icon on ANY
// surface opens the composer in repost mode via the app-wide RepostContext.
function App() {
  // Initialize from the synchronous cookie check (NOT `false`): the anon-mode
  // routes below (`isAnon ? <Navigate to="/discover"> : <Screen>`) render on the
  // FIRST paint, and child effects run before the mount effect that would
  // otherwise flip `signedIn` to true. Starting from `false` makes a signed-in
  // user's first render anon → a hard-refresh / deep-link to /feed bounces to
  // /discover before the feed can mount (the anon PR's regression). `isSignedIn`
  // is a cookie read (no side effects), so deriving initial state from it is
  // safe. The mount effect still runs the access recovery + authListen.
  const [signedIn, setSignedIn] = useState(() => getSocialAuth().isSignedIn());
  const [musicSession, setMusicSession] = useState(() => {
    const who = getSocialAuth().readToken();
    return who ? JSON.stringify([who.provider, who.username, getV3Client().readToken()?.expires ?? null]) : 'anonymous';
  });
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
      void identifyAnalytics(() => getV3Client().state.token ?? window.web10?.readTokenCookie() ?? null).then(trackProductSession);
      setSignedIn(true);
      runAccessRecovery(false);
    }
    auth.authListen(() => {
      setSignedIn(true);
      setSessionAlert(null);
      trackEvent('login');
      const who = auth.readToken();
      setMusicSession(who ? JSON.stringify([who.provider, who.username, getV3Client().readToken()?.expires ?? null]) : 'anonymous');
      void identifyAnalytics(() => getV3Client().state.token ?? window.web10?.readTokenCookie() ?? null).then(trackProductSession);
      // The sign-in (or a reauth) IS the recovery — no need to re-verify here.
      // Verifying during the sign-in transition hits a "Failed to fetch" (the
      // session is mid-handoff). The mount + reactive-failure paths cover it.
    });

    // The recovery's terminal signout (user not found) clears the cookie and
    // signals us to show the login screen.
    const onSignedOut = () => {
      resetAnalytics();
      setMusicSession('anonymous');
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
    const postHandler = (e: Event) => {
      const customEvent = e as CustomEvent<{ username: string; postId: string; provider: string }>;
      navigate(`/u/${customEvent.detail.username}/p/${customEvent.detail.postId}`, { state: { provider: customEvent.detail.provider } });
    };
    window.addEventListener('navigate-post', postHandler);
    return () => {
      window.removeEventListener('session:signed-out', onSignedOut);
      window.removeEventListener('unhandledrejection', onAuthError);
      window.removeEventListener('error', onAuthError);
      window.removeEventListener('navigate-user-profile', handler);
      window.removeEventListener('navigate-post', postHandler);
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
      teardownNotifications();
      teardownMessagesUnread();
      return;
    }
    // The notification store is app-wide (D69): init it whenever signed in,
    // independent of the P2P toggle. It seeds from CRUD (works offline) and
    // subscribes to the P2P bus for live nudges (no-ops when P2P is off).
    initNotifications().catch((e) => LOG_ERR('initNotifications — failed:', e));
    // The Messages unread store (the purple badge on the Messages icon): init
    // it whenever signed in, independent of the P2P toggle. It seeds the
    // per-conversation read cursors from settings + the last message of every
    // conversation (CRUD), and subscribes to the P2P bus for live bumps.
    initMessagesUnread().catch((e) => LOG_ERR('initMessagesUnread — failed:', e));
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
      // Seed a public profile face on sign-in (idempotent, non-clobbering) so
      // the account is discoverable in the D0 people directory from birth —
      // the followers group is public-by-default but the face content is only
      // ever created when the user edits their profile, which left new
      // accounts absent from the directory. A failure is a benign degrade.
      ensureProfile().catch((e) => LOG_ERR('ensureProfile — failed:', e));
    } else {
      teardownP2P();
      teardownNotifications();
      teardownMessagesUnread();
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
    // The CTA / the signed-out "Log in" are user gestures — a popup blocked
    // DESPITE one means popups are disabled for this site. The toast is the
    // only signal left (the gesture can't open the wheel it needs).
    const opened = getSocialAuth().login();
    if (!opened) {
      toast.error(
        'Couldn\'t open the login window. Allow pop-ups for this site, then try again.',
      );
    }
  }

  function handleLogout() {
    getSocialAuth().signOut();
    setMusicSession('anonymous');
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

  // Anon browsing (the operator: "supporting anon login with web10 social"):
  // a signed-out visitor is NOT wall'd off at the login screen. They get the
  // app shell in a read-only mode — the Discover board (the public ledger),
  // post permalinks, profiles, shorts — and a clear Sign in affordance. The
  // node is readable by design (D41/D58): the discover board + public posts +
  // public profile faces are `anyone`-readable, so the same screens render for
  // anon (the SDK's read path is anon-capable). Signed-in-only surfaces
  // (feed, messages, notifications, settings, monetize, your own
  // profile) redirect to /discover when there's no session.
  const isAnon = !signedIn;

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
      <RepostProvider>
      <ComposerProvider>
      <SaveProvider>
      <MusicProvider sessionKey={musicSession}>
      <UploadProvider sessionKey={musicSession}>
      <Routes>
        {/* Only entry URLs get the pitch. Public deep links stay in the app.
            Confirmed auth changes isAnon; opening the popup alone does not. */}
        <Route path="/" element={<Navigate to={isAnon ? '/join' : '/feed'} replace />} />
        <Route path="/join" element={isAnon ? <JoinScreen onLogin={handleLogin} /> : <Navigate to="/feed" replace />} />
        <Route element={<Layout onLogout={handleLogout} onLogin={handleLogin} isAnon={isAnon} onReportBug={() => handleReportBug('button')} />}>
          <Route path="/feed" element={<PostsScreen onAuthorClick={handleAuthorClick} />} />
          {/* The Discover split (watch-page.md): the old single /discover
              (Trending|People tabs + Home|Hot Gossip toggle) is four flat
              destinations. /discover (bare) → Video (the default);
              ?view=grid → Hot Gossip; ?tab=explore → People. The ?knobs= /
              ?q= / ?tag= deep links survive on the relevant destinations. */}
          <Route path="/video" element={<DiscoverScreen />} />
          <Route path="/hot-gossip" element={isAnon ? <DiscoverScreen mode="hot-gossip" /> : <HotGossipRedirect />} />
          <Route path="/people" element={<DiscoverScreen />} />
          <Route path="/discover" element={<DiscoverRedirect />} />
          <Route path="/watch/:postId" element={<WatchScreen />} />
          <Route path="/shorts" element={<ShortsScreen />} />
          <Route path="/shorts/:postId" element={<ShortsScreen />} />
          <Route path="/music" element={<MusicScreen />} />
          <Route path="/uploads" element={isAnon ? <section className="mx-auto max-w-lg p-6"><h1 className="font-display text-2xl font-semibold text-foreground">Your private uploads</h1><p className="mt-3 text-sm text-muted-foreground">Log in to the original account to recover its pending posts.</p><Button variant="brand" className="mt-4 min-h-11" onClick={handleLogin}>Log in</Button></section> : <UploadsScreen />} />
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/groups/:groupId" element={<GroupDetailRoute />} />
          <Route path="/groups/:groupId/saved/:collectionId" element={<GroupSavedCollectionRoute />} />
          <Route path="/messages/*" element={isAnon ? <Navigate to="/video" replace /> : <DmsScreen />} />
          <Route path="/notifications" element={isAnon ? <Navigate to="/video" replace /> : <NotificationsScreen />} />
          <Route path="/profile" element={isAnon ? <Navigate to="/video" replace /> : <ProfileRedirectRoute />} />
          <Route path="/u/:username" element={<UserProfileRoute />} />
          <Route path="/u/:username/store" element={<StorefrontScreen />} />
          <Route path="/u/:username/saved/:collectionId" element={<SavedCollectionRoute />} />
          <Route path="/u/:username/pins" element={<ProfilePinsRoute />} />
          <Route path="/u/:username/followers" element={isAnon ? <Navigate to="/video" replace /> : <UserFollowersRoute />} />
          <Route path="/u/:username/following" element={isAnon ? <Navigate to="/video" replace /> : <UserFollowingRoute />} />
          <Route path="/u/:username/p/:postId" element={<UserProfilePostLinkRoute />} />
          <Route path="/groups/:groupId/p/:postId" element={<UserProfilePostLinkRoute />} />
          <Route path="/monetize" element={isAnon ? <Navigate to="/video" replace /> : <MonetizationScreen />} />
          <Route path="/appearance" element={<AppearanceScreen />} />
          <Route path="/settings" element={isAnon ? <Navigate to="/video" replace /> : <SettingsScreen onLogout={handleLogout} onReportBug={() => handleReportBug('button')} />} />
          <Route path="/node-settings" element={isAnon ? <Navigate to="/video" replace /> : <NodeSettingsScreen />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Route>
      </Routes>
       <MusicPlayer />
      {/* The app-level composer (the "New Post" sheet) — one composer for the
          whole app, opened by the Layout's floating "+" button, a group
          feed's "Post to this group", or a repeat icon (repost mode). The
          inline composer boxes on the feed / profile / video / group
          surfaces are retired (the operator: "it should be invisible"). */}
       <NewPostSheet />
       {/* The app-level "Save to…" sheet (D88) — one sheet for the whole app,
           opened by a post surface's kebab (the feed card's Save control). */}
        <SaveSheet />
        <UploadDock />
        </UploadProvider>
        </MusicProvider>
       </SaveProvider>
       </ComposerProvider>
       </RepostProvider>
      <Toaster />
      {/* D72: the PWA install surface — one dismissible card at the moment of
          value (Shorts on a phone, a follow), fired by requestInstallPrompt. */}
      <InstallPrompt />
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

// The Discover split's redirect (watch-page.md): the old /discover URL (the
// Trending|People tabs + Home|Hot Gossip toggle) maps to the four flat
// destinations. The ?knobs= / ?q= / ?tag= deep links survive on the relevant
// destination (carried over verbatim). Bare /discover → Video (the default);
// ?view=grid → Hot Gossip; ?tab=explore → People.
function DiscoverRedirect() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  params.delete('view');
  params.delete('tab');
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : '';
  if (searchParams.get('tab') === 'explore') {
    return <Navigate to={`/people${suffix}`} replace />;
  }
  if (searchParams.get('view') === 'grid') {
    return <Navigate to={`/hot-gossip${suffix}`} replace />;
  }
  return <Navigate to={`/video${suffix}`} replace />;
}

// /hot-gossip → the Posts screen's Discover tab (the merged Feed + Hot Gossip
// surface). The query is carried over verbatim so the marketing link-out
// (`/hot-gossip?post=<id>`) lands on the Discover board scrolled to +
// highlighting that post, and a `?q=` search lands filtered. Discover is the
// default tab, so no `?tab=` is added.
function HotGossipRedirect() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  params.delete('tab');
  const qs = params.toString();
  return <Navigate to={`/feed${qs ? `?${qs}` : ''}`} replace />;
}

export default App;
