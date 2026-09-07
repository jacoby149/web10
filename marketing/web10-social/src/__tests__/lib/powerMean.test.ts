import { describe, it, expect } from 'vitest';
import {
  knobStateToSort,
  FIXED_CHARACTER_DETEENT,
  FIXED_CHARACTER_P,
  CHARACTER_DETENTS,
  WEIGHT_DETENTS,
  HALF_LIFE_DETENTS,
  defaultKnobState,
  type KnobState,
} from '@/lib/powerMean';

// ── knobStateToSort — the client→server knob mapping (D36 server-side rank) ──
// The Character knob is gone from the rack; the exponent is fixed at the
// middle (p = 0, the weighted geometric mean). These tests pin the mapping so
// the client and the node's PowerMeanSort stay aligned.

describe('FIXED_CHARACTER (the removed Character knob)', () => {
  it('fixes the exponent at the middle detent (p = 0, geometric)', () => {
    // The middle of the 6 detents is p = 0 — "Mean" (the weighted geometric
    // mean): no signal dominates, a post is scored on the balance of its
    // signals.
    expect(CHARACTER_DETENTS[FIXED_CHARACTER_DETEENT]).toBe(0);
    expect(FIXED_CHARACTER_P).toBe(0);
  });
});

describe('knobStateToSort (detent state → server PowerMeanSort)', () => {
  it('maps the weight detents to 0..1 and the half-life detent to ms', () => {
    const state: KnobState = { recency: 5, likes: 0, comments: 3, halfLife: 0, character: 0 };
    const sort = knobStateToSort(state);
    expect(sort.recency).toBe(WEIGHT_DETENTS[5]); // 1
    expect(sort.likes).toBe(WEIGHT_DETENTS[0]); // 0
    expect(sort.comments).toBe(WEIGHT_DETENTS[3]); // 0.6
    expect(sort.half_life_ms).toBe(HALF_LIFE_DETENTS[0]); // 1h
  });

  it('always pins character to the fixed middle (the knob is gone)', () => {
    // Even if a stale persisted/URL state carries a non-middle character
    // detent, the sort config pins it to the fixed value.
    const state: KnobState = { recency: 3, likes: 3, comments: 2, halfLife: 3, character: 5 };
    expect(knobStateToSort(state).character).toBe(FIXED_CHARACTER_P);
    const state2: KnobState = { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 };
    expect(knobStateToSort(state2).character).toBe(FIXED_CHARACTER_P);
  });

  it('maps the Balanced default to the node config', () => {
    const sort = knobStateToSort(defaultKnobState());
    expect(sort).toEqual({
      recency: WEIGHT_DETENTS[3], // 0.6
      likes: WEIGHT_DETENTS[3], // 0.6
      comments: WEIGHT_DETENTS[2], // 0.4
      half_life_ms: HALF_LIFE_DETENTS[3], // 1d
      character: FIXED_CHARACTER_P, // 0
    });
  });

  it('maps the Most-loved preset (likes-only, all time)', () => {
    const state: KnobState = { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 };
    const sort = knobStateToSort(state);
    expect(sort).toEqual({
      recency: 0,
      likes: 1,
      comments: 0,
      half_life_ms: 0, // ∞ (all time)
      character: FIXED_CHARACTER_P,
    });
  });
});
