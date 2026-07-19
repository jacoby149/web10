// The reach-gap proof section's data + math (design.md §2, plan.txt THE
// STORY beat 1): "1M subscribers, the video does 300k" — subs are not
// delivery. Kept as pure functions so the landing page's persuasive number
// is tested, not just eyeballed.

export interface ReachGapExample {
  /** followers/subscribers the creator has earned */
  followers: number
  /** how many of them the platform's feed algorithm actually shows a post */
  shownElsewhere: number
}

/** the illustrative case cited throughout plan.txt / manifesto.md */
export const REACH_GAP_EXAMPLE: ReachGapExample = {
  followers: 1_000_000,
  shownElsewhere: 300_000,
}

/** web10 delivers to every follower's inbox on write — no algorithm to throttle. */
export const WEB10_DELIVERY_PERCENT = 100

/** % of `followers` who actually see a given post. Never > 100, never < 0. */
export function deliveryPercent(shown: number, followers: number): number {
  if (followers <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((shown / followers) * 100)))
}

/** thousands-grouped, locale-stable count for display (1000000 -> "1,000,000"). */
export function formatFollowerCount(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
