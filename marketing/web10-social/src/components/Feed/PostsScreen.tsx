import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flame, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWapi } from '@/data/wapi';
import PostComposer from '@/components/Feed/PostComposer';
import FeedScreen from '@/components/Feed/FeedScreen';
import DiscoverScreen from '@/components/Discover/DiscoverScreen';
import { useRepost } from '@/context/RepostContext';
import { trackEvent } from '@/lib/analytics';
import type { PostRecord } from '@/data/types';

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
  const { repostingTo, setRepostingTo, clearReposting } = useRepost();
  // Bumping `version` remounts FeedScreen so a fresh post / repost shows up
  // immediately (the old FeedRoute's remount idiom).
  const [version, setVersion] = useState(0);

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
        <>
          {/* The composer lives on the Following tab (the personal feed) — the
              X model. A repost from the Discover tab navigates here (the
              composer is the single write, reposts.md). */}
          <PostComposer
            repostingTo={repostingTo}
            onRepostCancel={clearReposting}
            onPostCreated={() => {
              clearReposting();
              setVersion((v) => v + 1);
              trackEvent('post_created');
            }}
          />
          <FeedScreen key={version} onAuthorClick={onAuthorClick} onRepost={setRepostingTo} />
        </>
      ) : (
        <DiscoverScreen mode="hot-gossip" />
      )}
    </div>
  );
}
