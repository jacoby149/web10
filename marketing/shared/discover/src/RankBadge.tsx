import { Flame } from 'lucide-react';
import { Badge } from './ui';

/**
 * The discover card's rank badge + heat glow (the social app's, adopted by the
 * marketing card — D73). Rank tiers: #1 gold (warning), #2-3 silver (neutral),
 * #4+ brand. The heat glow is tiered violet halos keyed to the post's score
 * relative to the board's max (design.md §4: one decorative glow per screen).
 */

export function heatTier(score: number, maxScore: number): 0 | 1 | 2 | 3 {
  if (!maxScore || score <= 0) return 0;
  const ratio = score / maxScore;
  if (ratio >= 0.66) return 3;
  if (ratio >= 0.33) return 2;
  return 1;
}

export const HEAT_SHADOW: Record<number, string> = {
  0: '',
  1: 'shadow-[0_0_24px_-8px_var(--color-glow)]',
  2: 'shadow-[0_0_36px_-8px_var(--color-glow-intense)]',
  3: 'shadow-[0_0_52px_-6px_var(--color-glow-intense)]',
};

export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Badge
        variant="warning"
        data-testid="discover-rank-badge"
        className="border border-warning/40 bg-warning/15 text-warning normal-case tracking-normal"
        aria-label={`Rank ${rank}, number one`}
      >
        <Flame className="mr-1 h-3 w-3" strokeWidth={2} />
        #{rank}
      </Badge>
    );
  }
  if (rank <= 3) {
    return (
      <Badge
        variant="default"
        data-testid="discover-rank-badge"
        className="border border-border bg-elevated text-foreground normal-case tracking-normal"
        aria-label={`Rank ${rank}, top three`}
      >
        #{rank}
      </Badge>
    );
  }
  return (
    <Badge
      variant="brand"
      data-testid="discover-rank-badge"
      aria-label={`Rank ${rank}`}
    >
      #{rank}
    </Badge>
  );
}
