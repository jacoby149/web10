import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flame, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWapi } from '@/data/wapi';
import FeedScreen from '@/components/Feed/FeedScreen';
import DiscoverScreen from '@/components/Discover/DiscoverScreen';
import { useRepost } from '@/context/RepostContext';

// The Posts screen — the merged Feed + Hot Gossip surface (the X/Threads model:
// one destination, a "Discover | Following" tab row inside). The operator's
// call (29.09.2026): the separate Feed + Hot Gossip sidebar tabs collapse into
// ONE "Posts" destination (the flame icon) with the two feeds as tabs — "like
// how x.com does it, For you | Following". The URL holds the tab (?tab=):
// bare /feed = Discover (the default, the ranked board), ?tab=following = the
// personal feed (composer + the posts from people you follow).
//
// Anon (signed-out): no Following tab (no session → no feed). The screen is
// just the Discover board (the public ledger) — the same read-only board the
// old /hot-gossip showed.

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
        'relative flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className={cn('h-4 w-4', active && 'text-brand')} strokeWidth={active ? 2 : 1.75} />
      <span>{label}</span>
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-brand to-brand-600"
        />
      )}
    </button>
  );
}

export default function PostsScreen({ onAuthorClick }: { onAuthorClick?: (username: string, provider: string) => void }) {
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

  // Anon: no Following tab (no session → no feed). The screen is just the
  // Discover board (the public ledger), the same read-only board the old
  // /hot-gossip showed.
  if (isAnon) {
    return <DiscoverScreen mode="hot-gossip" />;
  }

  const tab: PostsTab = tabFromParam(searchParams.get('tab'));

  const setTab = (next: PostsTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'discover') params.delete('tab');
    else params.set('tab', 'following');
    setSearchParams(params);
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* The tab row — X/Threads-style: Discover | Following. The URL holds the
          tab (?tab=), so refresh restores it + it's shareable. Discover is the
          default (the bare URL). */}
      <div
        className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-md"
        role="tablist"
        aria-label="Posts"
        data-testid="posts-tab-row"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 md:px-6">
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

      {tab === 'following' ? (
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
