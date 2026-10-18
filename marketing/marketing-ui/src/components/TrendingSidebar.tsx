import { Top10Sidebar, type Top10SidebarEntry } from '@web10/discover';
import type { FeedPost } from '@/components/FeedPreview';

// /trending sidebar — desktop only (wide screens). A thin wrapper over the
// SHARED Top 10 rail (@web10/discover `Top10Sidebar`) — the same component the
// social app's Hot Gossip board runs, so the two rails can't drift (D73). This
// wrapper maps the marketing `FeedPost` onto the shared entry shape (the score
// is the raw engagement tally — likes + comments + reposts, the same rule the
// social rail had). Selecting an entry scrolls the matching card into view in
// the main grid (D-trending-sidebar). Owned by Lane D, marketing-ui.

interface TrendingSidebarEntry {
  post: FeedPost;
  rank: number;
}

interface TrendingSidebarProps {
  entries: TrendingSidebarEntry[];
  onSelect: (postId: string) => void;
}

function TrendingSidebar({ entries, onSelect }: TrendingSidebarProps) {
  const sharedEntries: Top10SidebarEntry[] = entries.map(({ post, rank }) => ({
    id: post.id,
    name: post.name,
    text: post.content,
    score: (post.likesCount || 0) + (post.commentsCount || 0) + (post.repostsCount || 0),
    rank,
  }));
  return (
    <Top10Sidebar
      entries={sharedEntries}
      onSelect={onSelect}
      testId="trending-sidebar"
      stickyTop="top-24"
    />
  );
}

export { TrendingSidebar };
export type { TrendingSidebarEntry };
