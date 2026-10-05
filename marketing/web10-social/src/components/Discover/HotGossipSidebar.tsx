import { Flame } from 'lucide-react';
import type { PostRecord } from '@/data';

// The Hot Gossip Top 10 rail — the social-app analog of the marketing
// /trending `TrendingSidebar` (one content rail, not a nav rail). Desktop
// only (wide screens): a compact ranked list; selecting an entry scrolls the
// matching board card into view + highlights it (the same ?post= deep-link
// the marketing link-out uses). The board is the hero; the rail is a shortcut
// to the top of the board, so it sits to the right of the (now narrower)
// single-column board instead of the board running full-bleed.

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

function scoreText(score: number | undefined): string {
  if (!score || score <= 0) return '—';
  if (score >= 1000) return `${(score / 1000).toFixed(1)}k`;
  return String(Math.round(score));
}

function HotGossipSidebar({ entries, onSelect }: HotGossipSidebarProps) {
  if (entries.length === 0) return null;
  return (
    <aside
      data-testid="hot-gossip-sidebar"
      className="hidden w-72 shrink-0 lg:block"
      aria-label="Top 10 trending posts"
    >
      <div className="sticky top-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-warning" strokeWidth={1.75} />
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.04em] text-foreground">
            Top 10
          </h2>
        </div>
        <ol className="mt-3 space-y-1">
          {entries.map(({ post, rank, score }) => {
            const rankTone =
              rank === 1
                ? 'text-warning'
                : rank <= 3
                  ? 'text-foreground'
                  : 'text-muted-foreground';
            const id = post._id || '';
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  data-testid="hot-gossip-sidebar-entry"
                  className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  aria-label={`Jump to rank ${rank}: ${post.author_username || 'unknown'}`}
                >
                  <span
                    className={`w-6 shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${rankTone}`}
                  >
                    {rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {post.author_username || 'unknown'}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {post.text || '(no text)'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {scoreText(score)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}

export { HotGossipSidebar };
export type { HotGossipSidebarEntry };
