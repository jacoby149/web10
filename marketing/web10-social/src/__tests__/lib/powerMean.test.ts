import { describe, it, expect } from 'vitest';
import {
  knobStateToSort,
  FIXED_CHARACTER_DETEENT,
  FIXED_CHARACTER_P,
  FIXED_HALF_LIFE_DETEENT,
  FIXED_HALF_LIFE_MS,
  CHARACTER_DETENTS,
  WEIGHT_DETENTS,
  HALF_LIFE_DETENTS,
  defaultKnobState,
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
  it('maps the weight detents to 0..1 and always pins the half-life to 1 day', () => {
    // The Time knob is gone — the half-life is fixed at the middle (1 day)
    // regardless of the state's (stale/persisted) halfLife detent.
    const state: KnobState = { recency: 5, likes: 0, comments: 3, halfLife: 0, character: 0 };
    const sort = knobStateToSort(state);
    expect(sort.recency).toBe(WEIGHT_DETENTS[5]); // 1
    expect(sort.likes).toBe(WEIGHT_DETENTS[0]); // 0
    expect(sort.comments).toBe(WEIGHT_DETENTS[3]); // 0.6
    expect(sort.half_life_ms).toBe(FIXED_HALF_LIFE_MS); // 1d (fixed)
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
    const sort = knobStateToSort(defaultKnobState());
    expect(sort).toEqual({
      recency: WEIGHT_DETENTS[3], // 0.6
      likes: WEIGHT_DETENTS[3], // 0.6
      comments: WEIGHT_DETENTS[2], // 0.4
      half_life_ms: FIXED_HALF_LIFE_MS, // 1d (fixed)
      character: FIXED_CHARACTER_P, // 0
    });
  });

  it('maps the Most-loved preset (likes-only) — half-life still fixed at 1 day', () => {
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
