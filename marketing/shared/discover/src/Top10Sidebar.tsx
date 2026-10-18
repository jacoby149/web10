import { Flame } from 'lucide-react';
import { formatCount } from './utils';
import { MarkdownText } from './MarkdownText';

// The shared Top 10 rail (D73) — the one both apps' discover surfaces compose.
// The marketing /trending `TrendingSidebar` and the social app's
// `HotGossipSidebar` were near-identical copies (~90 lines each, drifting on
// the entry type + the score formatting); they are now this one component.
//
// Desktop only (wide screens): a compact ranked list beside the board;
// selecting an entry scrolls the matching board card into view (the surface
// decides what "scroll" means — the marketing page scrolls the grid, the
// social board sets the ?post= highlight). The rail is a content rail (a
// shortcut to the top of the board), not a nav rail.
//
// The entry is app-agnostic on purpose: the surface maps its own post type
// (the marketing `FeedPost`, the social `PostRecord`) onto `id` / `name` /
// `text` / `score` and injects `onSelect`. The score is the raw engagement
// tally (likes + comments + reposts) — the rail's right-hand number — NOT the
// knob's normalized power-mean score (the same rule both apps' rails had).

export interface Top10SidebarEntry {
  /** The post's doc_id (the surface's onSelect key). */
  id: string;
  /** The author's display name (the entry's first line). */
  name: string;
  /** The post's text (the entry's second line, truncated). */
  text: string;
  /** The engagement tally (likes + comments + reposts). */
  score: number;
  /** The board rank (1-based, the entry's left-hand number). */
  rank: number;
}

export interface Top10SidebarProps {
  entries: Top10SidebarEntry[];
  /** Jump the board to this post (the surface's scroll / highlight). */
  onSelect: (postId: string) => void;
  /** The aside's data-testid (the apps' suites key on their own idiom). */
  testId?: string;
  /** The sticky offset (the marketing page's control band is taller). */
  stickyTop?: string;
}

function scoreText(score: number | undefined): string {
  if (!score || score <= 0) return '—';
  return formatCount(Math.round(score));
}

export function Top10Sidebar({
  entries,
  onSelect,
  testId = 'top10-sidebar',
  stickyTop = 'top-24',
}: Top10SidebarProps) {
  if (entries.length === 0) return null;
  return (
    <aside
      data-testid={testId}
      className="hidden w-72 shrink-0 lg:block"
      aria-label="Top 10 trending posts"
    >
      <div className={`sticky ${stickyTop} rounded-xl border border-border bg-surface p-4`}>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-warning" strokeWidth={1.75} />
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.04em] text-foreground">
            Top 10
          </h2>
        </div>
        <ol className="mt-3 space-y-1">
          {entries.map(({ id, name, text, score, rank }) => {
            const rankTone =
              rank === 1
                ? 'text-warning'
                : rank <= 3
                  ? 'text-foreground'
                  : 'text-muted-foreground';
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  data-testid={`${testId}-entry`}
                  className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  aria-label={`Jump to rank ${rank}: ${name}`}
                >
                  <span
                    className={`w-6 shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${rankTone}`}
                  >
                    {rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      <MarkdownText text={text} />
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
