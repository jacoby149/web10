import { Flame } from 'lucide-react';
import type { FeedPost } from '@/components/FeedPreview';
import { formatCount } from '@/components/FeedPreview';

// /trending sidebar — desktop only (wide screens). A compact "Top 10"
// ranked list; selecting an entry scrolls the matching card into view in
// the main grid (D-trending-sidebar). Owned by Lane D, marketing-ui.

interface TrendingSidebarEntry {
  post: FeedPost;
  rank: number;
}

interface TrendingSidebarProps {
  entries: TrendingSidebarEntry[];
  onSelect: (postId: string) => void;
}

function scoreText(score: number | undefined): string {
  if (!score || score <= 0) return '—';
  if (score >= 1000) return `${(score / 1000).toFixed(1)}k`;
  return formatCount(Math.round(score));
}

function TrendingSidebar({ entries, onSelect }: TrendingSidebarProps) {
  if (entries.length === 0) return null;
  return (
    <aside
      data-testid="trending-sidebar"
      className="hidden w-72 shrink-0 lg:block"
      aria-label="Top 10 trending posts"
    >
      <div className="sticky top-24 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-warning" strokeWidth={1.75} />
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.04em] text-foreground">
            Top 10
          </h2>
        </div>
        <ol className="mt-3 space-y-1">
          {entries.map(({ post, rank }) => {
            const rankTone =
              rank === 1
                ? 'text-warning'
                : rank <= 3
                  ? 'text-foreground'
                  : 'text-muted-foreground';
            return (
              <li key={post.id}>
                <button
                  type="button"
                  onClick={() => onSelect(post.id)}
                  data-testid="trending-sidebar-entry"
                  className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  aria-label={`Jump to rank ${rank}: ${post.name}`}
                >
                  <span
                    className={`w-6 shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${rankTone}`}
                  >
                    {rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {post.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {post.content}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {scoreText(post.engagementScore)}
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

export { TrendingSidebar };
export type { TrendingSidebarEntry };