import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flame, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWapi } from '@/data/wapi';
import FeedScreen from '@/components/Feed/FeedScreen';
import DiscoverScreen from '@/components/Discover/DiscoverScreen';
import { useRepost } from '@/context/RepostContext';
import { SignInPrompt } from '@/components/shared/SignInPrompt';

// The Posts screen — the merged Feed + Hot Gossip surface (the X/Threads model:
// one destination, a "Discover | Following" tab row inside). The operator's
// call (29.09.2026): the separate Feed + Hot Gossip sidebar tabs collapse into
// ONE "Posts" destination (the flame icon) with the two feeds as tabs — "like
// how x.com does it, For you | Following". The URL holds the tab (?tab=):
// bare /feed = Discover (the default, the ranked board), ?tab=following = the
// personal feed (composer + the posts from people you follow).
//
// Signed out: Discover remains public. Following explains why to sign in and
// never mounts the personal feed until the session exists.

type PostsTab = 'discover' | 'following';

function tabFromParam(raw: string | null): PostsTab {
  return raw === 'following' ? 'following' : 'discover';
}

function TabButton({
  active,
  onClick,
  testId,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  icon: typeof Flame;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'relative flex flex-1 items-center justify-center gap-2 py-3.5 text-[0.9375rem] transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className={cn('h-[18px] w-[18px]', active && 'text-brand')} strokeWidth={active ? 2.25 : 1.75} />
      <span>{label}</span>
      {active && (
        <span
          aria-hidden="true"
          className="absolute -bottom-px left-1/2 h-[3px] w-14 -translate-x-1/2 rounded-full bg-brand"
        />
      )}
    </button>
  );
}

export default function PostsScreen({ onAuthorClick, onLogin }: { onAuthorClick?: (username: string, provider: string) => void; onLogin?: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isAnon = !getWapi().readToken();
  const { setRepostingTo } = useRepost();
  // Bumping `version` remounts FeedScreen so a fresh post / repost shows up
  // immediately (the old FeedRoute's remount idiom). The app-level New Post
  // sheet fires `post-created` (NewPostSheet) — the listener below is the
  // seam that replaces the old inline composer's onPostCreated callback.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onPostCreated = () => setVersion((v) => v + 1);
    window.addEventListener('post-created', onPostCreated);
    return () => window.removeEventListener('post-created', onPostCreated);
  }, []);

  // The requested tab survives login, refresh and browser history. An anon
  // Following route is an invitation, not permission to read a personal feed.
  const tab: PostsTab = tabFromParam(searchParams.get('tab'));

  const setTab = (next: PostsTab) => {
    console.log('[posts] selecting tab:', next, 'signed-in:', !isAnon);
    const params = new URLSearchParams(searchParams);
    if (next === 'discover') params.delete('tab');
    else params.set('tab', 'following');
    setSearchParams(params);
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* The tab row — X/Threads-style: Discover | Following. Centered, bold,
          with the brand underline (the operator, 29.09.2026: "make it look
          flashy like x's for you following"). The URL holds the tab (?tab=),
          so refresh restores it + it's shareable. Discover is the default
          (the bare URL). */}
      <div
        className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-md"
        role="tablist"
        aria-label="Posts"
        data-testid="posts-tab-row"
      >
        <div className="mx-auto flex max-w-2xl">
          <TabButton
            active={tab === 'discover'}
            onClick={() => setTab('discover')}
            testId="posts-tab-discover"
            icon={Flame}
            label="Discover"
          />
          <TabButton
            active={tab === 'following'}
            onClick={() => setTab('following')}
            testId="posts-tab-following"
            icon={Home}
            label="Following"
          />
        </div>
      </div>

      {isAnon && tab === 'discover' && <div className="mx-auto w-full max-w-5xl px-4 pt-4"><SignInPrompt placement="feed" onLogin={onLogin} /></div>}
      {tab === 'following' && isAnon ? <SignInPrompt placement="following" onLogin={onLogin} /> : tab === 'following' ? (
        /* The personal feed. The composer is NOT inline (the operator: "it
           should be invisible") — the app-level New Post sheet (the Layout's
           floating "+" button) is the single compose surface. A repost from
           any surface opens that sheet in repost mode (reposts.md). */
        <FeedScreen key={version} onAuthorClick={onAuthorClick} onRepost={setRepostingTo} />
      ) : (
        <DiscoverScreen mode="hot-gossip" />
      )}
    </div>
  );
}
