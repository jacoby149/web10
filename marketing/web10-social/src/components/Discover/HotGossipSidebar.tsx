import { Top10Sidebar, type Top10SidebarEntry } from '@web10/discover';
import type { PostRecord } from '@/data';

// The Hot Gossip Top 10 rail — a thin wrapper over the SHARED Top 10 rail
// (@web10/discover `Top10Sidebar`), the same component the marketing /trending
// page runs, so the two rails can't drift (D73). This wrapper maps the social
// `PostRecord` onto the shared entry shape. Desktop only (wide screens): a
// compact ranked list beside the board; selecting an entry scrolls the matching
// board card into view + highlights it (the same ?post= deep-link the marketing
// link-out uses). The board is the hero; the rail is a shortcut to the top of
// the board, so it sits to the right of the (now narrower) single-column board
// instead of the board running full-bleed.

interface HotGossipSidebarEntry {
  post: PostRecord;
  rank: number;
  /** The engagement tally (likes + comments + reposts) — the rail's right-hand number. */
  score: number;
}

interface HotGossipSidebarProps {
  entries: HotGossipSidebarEntry[];
  /** Jump the board to this post (the ?post= highlight + scroll). */
  onSelect: (postId: string) => void;
}

function HotGossipSidebar({ entries, onSelect }: HotGossipSidebarProps) {
  const sharedEntries: Top10SidebarEntry[] = entries.map(({ post, rank, score }) => ({
    id: post._id || '',
    name: post.author_username || 'unknown',
    text: post.text || '(no text)',
    score,
    rank,
  }));
  return (
    <Top10Sidebar
      entries={sharedEntries}
      onSelect={onSelect}
      testId="hot-gossip-sidebar"
      stickyTop="top-4"
    />
  );
}

export { HotGossipSidebar };
export type { HotGossipSidebarEntry };
