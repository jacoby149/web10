import { describe, it, expect } from 'vitest';
import {
  knobStateToSort,
  FIXED_CHARACTER_DETEENT,
  FIXED_CHARACTER_P,
  FIXED_HALF_LIFE_DETEENT,
  FIXED_HALF_LIFE_MS,
  CHARACTER_DETENTS,
  WEIGHT_DETENTS,
  RECENCY_WEIGHTS,
  HALF_LIFE_DETENTS,
  defaultKnobState,
  scorePost,
  type KnobState,
} from '@/lib/powerMean';

// ── knobStateToSort — the client→server knob mapping (D36 server-side rank) ──
// The Character knob is gone from the rack; the exponent is fixed at the
// middle (p = 0, the weighted geometric mean). The Time knob is gone too; the
// recency half-life is fixed at the middle (1 day). These tests pin the
// mapping so the client and the node's PowerMeanSort stay aligned.

describe('FIXED_CHARACTER (the removed Character knob)', () => {
  it('fixes the exponent at the middle detent (p = 0, geometric)', () => {
    // The middle of the 6 detents is p = 0 — "Mean" (the weighted geometric
    // mean): no signal dominates, a post is scored on the balance of its
    // signals.
    expect(CHARACTER_DETENTS[FIXED_CHARACTER_DETEENT]).toBe(0);
    expect(FIXED_CHARACTER_P).toBe(0);
  });
});

describe('FIXED_HALF_LIFE (the removed Time knob)', () => {
  it('fixes the recency half-life at the middle detent (1 day)', () => {
    // The middle of the 6 detents is 1 day — recent posts are weighted but
    // not exclusively, the sensible default for a social feed.
    expect(HALF_LIFE_DETENTS[FIXED_HALF_LIFE_DETEENT]).toBe(86_400_000); // 1d
    expect(FIXED_HALF_LIFE_MS).toBe(86_400_000);
  });
});

describe('knobStateToSort (detent state → server PowerMeanSort)', () => {
  it('maps the weight detents (recency 0..8, likes/comments 0..1) and always pins the half-life to 1 day', () => {
    // The Time knob is gone — the half-life is fixed at the middle (1 day)
    // regardless of the state's (stale/persisted) halfLife detent.
    const state: KnobState = { recency: 5, likes: 0, comments: 3, halfLife: 0, character: 0 };
    const sort = knobStateToSort(state);
    expect(sort.recency).toBe(RECENCY_WEIGHTS[5]); // 8
    expect(sort.likes).toBe(WEIGHT_DETENTS[0]); // 0
    expect(sort.comments).toBe(WEIGHT_DETENTS[3]); // 0.6
    expect(sort.half_life_ms).toBe(FIXED_HALF_LIFE_MS); // 1d (fixed)
  });

  it('maps the recency detents on the steeper scale (each step doubles the pull)', () => {
    // The recency knob carries its own 0 → 8 curve so the top detent outweighs
    // likes + comments at their combined max (1.0 + 1.0) four-fold.
    expect(RECENCY_WEIGHTS).toHaveLength(6);
    expect(RECENCY_WEIGHTS[0]).toBe(0);
    expect(RECENCY_WEIGHTS[5]).toBe(8);
    // Each step from detent 1 up doubles the pull (0.5 → 1 → 2 → 4 → 8).
    for (let i = 2; i < 6; i++) expect(RECENCY_WEIGHTS[i]).toBe(RECENCY_WEIGHTS[i - 1] * 2);
    // The likes / comments scale is unchanged (0..1).
    expect(WEIGHT_DETENTS[3]).toBe(0.6);
    expect(WEIGHT_DETENTS[5]).toBe(1);
  });

  it('cranked recency prioritizes today over a little engagement on an old post (the potency fix)', () => {
    // Operator: "when i crank it up and have likes and comments just a little
    // bit it gets dominated by likes and comments". At the top recency detent
    // a fresh zero-engagement post must beat a two-day-old post with a few
    // likes/comments. (Before the fix the 1e-12 dead-signal floor made that
    // old post win by ~500×, no matter how far recency was cranked.)
    const cranked: KnobState = { recency: 5, likes: 1, comments: 1, halfLife: 3, character: 0 };
    const hourOld = { ageMs: 3_600_000, likes: 0, comments: 0, reposts: 0 };
    const twoDaysOld = { ageMs: 2 * 86_400_000, likes: 3, comments: 1, reposts: 0 };
    expect(scorePost(hourOld, cranked)).toBeGreaterThan(scorePost(twoDaysOld, cranked));
  });

  it('low recency detents keep engagement potency (the knob does not snap to chronological)', () => {
    // At the bottom of the steeper scale (0.5) a genuinely viral old post
    // still beats a fresh zero-engagement one — resolution across the range.
    const lowRecency: KnobState = { recency: 1, likes: 5, comments: 0, halfLife: 3, character: 0 };
    const hourOld = { ageMs: 3_600_000, likes: 0, comments: 0, reposts: 0 };
    const twoDaysViral = { ageMs: 2 * 86_400_000, likes: 200, comments: 50, reposts: 0 };
    expect(scorePost(twoDaysViral, lowRecency)).toBeGreaterThan(scorePost(hourOld, lowRecency));
  });

  it('floors a dead weighted signal at 0.05, not epsilon (a dead signal is a cost, not a veto)', () => {
    // Geometric mean over recency (age 0 → 1.0) + likes (0 → floored):
    // exp((8·ln(1) + 1·ln(0.05)) / 9) — the floor value is what the dead
    // likes signal contributes.
    const state: KnobState = { recency: 5, likes: 5, comments: 0, halfLife: 3, character: 0 };
    const s = scorePost({ ageMs: 0, likes: 0, comments: 0, reposts: 0 }, state);
    expect(s).toBeCloseTo(Math.exp(Math.log(0.05) / 9), 10);
  });

  it('always pins character to the fixed middle (the knob is gone)', () => {
    // Even if a stale persisted/URL state carries a non-middle character
    // detent, the sort config pins it to the fixed value.
    const state: KnobState = { recency: 3, likes: 3, comments: 2, halfLife: 3, character: 5 };
    expect(knobStateToSort(state).character).toBe(FIXED_CHARACTER_P);
    const state2: KnobState = { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 };
    expect(knobStateToSort(state2).character).toBe(FIXED_CHARACTER_P);
  });

  it('always pins the half-life to the fixed 1 day (the knob is gone)', () => {
    // Even if a stale persisted/URL state carries a non-middle halfLife
    // detent (∞, 1h, …), the sort config pins it to the fixed 1 day.
    const allTime: KnobState = { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 };
    expect(knobStateToSort(allTime)?.half_life_ms).toBe(FIXED_HALF_LIFE_MS);
    const oneHour: KnobState = { recency: 3, likes: 3, comments: 2, halfLife: 0, character: 0 };
    expect(knobStateToSort(oneHour)?.half_life_ms).toBe(FIXED_HALF_LIFE_MS);
  });

  it('maps the Balanced default to the node config', () => {
    // The default recency detent (3) now resolves on the steeper scale — the
    // mixed default is recency-forward (2.0 vs 0.6 likes + 0.4 comments).
    const sort = knobStateToSort(defaultKnobState());
    expect(sort).toEqual({
      recency: RECENCY_WEIGHTS[3], // 2
      likes: WEIGHT_DETENTS[3], // 0.6
      comments: WEIGHT_DETENTS[2], // 0.4
      half_life_ms: FIXED_HALF_LIFE_MS, // 1d (fixed)
      character: FIXED_CHARACTER_P, // 0
    });
  });

  it('maps the Most-liked preset (likes-only) — half-life still fixed at 1 day', () => {
    // "All time" is achieved by the recency weight being 0 (no recency
    // signal), not by the half-life — the half-life is now fixed at 1 day.
    const state: KnobState = { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 };
    const sort = knobStateToSort(state);
    expect(sort).toEqual({
      recency: 0,
      likes: 1,
      comments: 0,
      half_life_ms: FIXED_HALF_LIFE_MS, // 1d (fixed — "all time" is recency=0)
      character: FIXED_CHARACTER_P,
    });
  });
});
