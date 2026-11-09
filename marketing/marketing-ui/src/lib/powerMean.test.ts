import { describe, it, expect } from 'vitest';
import {
  normalizeRecency,
  normalizeLikes,
  normalizeComments,
  normalizeReposts,
  weightedPowerMean,
  WEIGHT_DETENTS,
  RECENCY_WEIGHTS,
  HALF_LIFE_DETENTS,
  HALF_LIFE_LABELS,
  CHARACTER_DETENTS,
  CHARACTER_LABELS,
  FIXED_CHARACTER_DETEENT,
  FIXED_CHARACTER_P,
  FIXED_HALF_LIFE_DETEENT,
  FIXED_HALF_LIFE_MS,
  defaultKnobState,
  PRESETS,
  getPreset,
  encodeMix,
  decodeMix,
  scorePost,
  rankPosts,
} from './powerMean';

describe('normalizers', () => {
  describe('normalizeRecency', () => {
    it('returns 1 for half-life ∞', () => {
      expect(normalizeRecency(1_000_000_000, 0)).toBe(1);
    });

    it('returns 1 for zero age', () => {
      expect(normalizeRecency(0, 3_600_000)).toBe(1);
    });

    it('decays exponentially', () => {
      const h1 = 3_600_000;
      expect(normalizeRecency(h1, h1)).toBeCloseTo(1 / Math.E);
      expect(normalizeRecency(h1 * 2, h1)).toBeCloseTo(1 / Math.E ** 2);
    });
  });

  describe('normalizeLikes', () => {
    it('returns 0 for 0 likes', () => {
      expect(normalizeLikes(0)).toBe(0);
    });

    it('saturates toward 1', () => {
      expect(normalizeLikes(10)).toBeGreaterThan(0.5);
      expect(normalizeLikes(1000)).toBeGreaterThan(0.8);
      expect(normalizeLikes(10000)).toBeLessThan(1);
    });
  });

  describe('normalizeComments', () => {
    it('returns 0 for 0 comments', () => {
      expect(normalizeComments(0)).toBe(0);
    });
  });

  describe('normalizeReposts', () => {
    it('returns 0 for 0 reposts', () => {
      expect(normalizeReposts(0)).toBe(0);
    });
  });
});

describe('weightedPowerMean', () => {
  it('p → +∞ approaches max signal', () => {
    const signals = [0.2, 0.8, 0.5];
    const weights = [1, 1, 1];
    const p10 = weightedPowerMean(signals, weights, 10);
    expect(p10).toBeGreaterThan(0.7);
    const p100 = weightedPowerMean(signals, weights, 100);
    expect(p100).toBeGreaterThan(0.78);
  });

  it('p → -∞ approaches min signal', () => {
    const signals = [0.2, 0.8, 0.5];
    const weights = [1, 1, 1];
    const pNeg10 = weightedPowerMean(signals, weights, -10);
    expect(pNeg10).toBeLessThan(0.25);
  });

  it('p = 0 is the geometric mean', () => {
    const signals = [0.5, 0.5, 0.5];
    const weights = [1, 1, 1];
    expect(weightedPowerMean(signals, weights, 0)).toBeCloseTo(0.5);
  });

  it('p = 0 with different signals gives weighted geometric mean', () => {
    const signals = [0.5, 1, 0.5];
    const weights = [1, 1, 1];
    const geo = Math.pow(0.5 * 1 * 0.5, 1 / 3);
    expect(weightedPowerMean(signals, weights, 0)).toBeCloseTo(geo, 6);
  });

  it('zero-weighted signals are excluded', () => {
    const signals = [0.1, 0.9, 0.5];
    const weights = [0, 1, 0];
    expect(weightedPowerMean(signals, weights, 1)).toBeCloseTo(0.9);
  });

  it('all-zero weights return 0', () => {
    const signals = [0.5, 0.5];
    const weights = [0, 0];
    expect(weightedPowerMean(signals, weights, 1)).toBe(0);
  });

  it('p = 1 is the arithmetic mean', () => {
    const signals = [0.2, 0.4, 0.6];
    const weights = [1, 1, 1];
    expect(weightedPowerMean(signals, weights, 1)).toBeCloseTo(0.4);
  });

  it('floors a dead signal to the signal floor (0.05) for p <= 0', () => {
    const signals = [0, 0.5, 0.5];
    const weights = [1, 1, 1];
    const result = weightedPowerMean(signals, weights, -1);
    expect(result).toBeGreaterThan(0);
  });

  it('the dead-signal floor is 0.05, not epsilon (a cost, not a veto)', () => {
    // Geometric mean (p = 0) over one live signal (1.0) and one dead signal:
    // the dead one contributes ln(0.05) — at the old 1e-12 floor it
    // contributed ln(1e-12) ≈ 27.6 log points, which no recency weight could
    // outrank (the recency-potency fix).
    expect(weightedPowerMean([1, 0], [1, 1], 0)).toBeCloseTo(Math.exp(Math.log(0.05) / 2), 10);
  });
});

describe('detents', () => {
  it('WEIGHT_DETENTS has 6 entries', () => {
    expect(WEIGHT_DETENTS).toHaveLength(6);
    expect(WEIGHT_DETENTS[0]).toBe(0);
    expect(WEIGHT_DETENTS[5]).toBe(1);
  });

  it('RECENCY_WEIGHTS is the steeper 6-step scale (each detent doubles the pull)', () => {
    // The recency knob runs 0 → 8 (not 0 → 1): the power mean compares
    // signals by RELATIVE weight, and a top recency weight of 1.0 could never
    // outweigh likes + comments at their combined max — the "recency is not
    // potent" complaint. 8.0 outweighs the engagement knobs four-fold.
    expect(RECENCY_WEIGHTS).toHaveLength(6);
    expect(RECENCY_WEIGHTS[0]).toBe(0);
    expect(RECENCY_WEIGHTS[5]).toBe(8);
    // Each step from detent 1 up doubles the pull (0.5 → 1 → 2 → 4 → 8).
    for (let i = 2; i < 6; i++) expect(RECENCY_WEIGHTS[i]).toBe(RECENCY_WEIGHTS[i - 1] * 2);
  });

  it('HALF_LIFE_DETENTS has 6 entries, last is ∞ (0)', () => {
    expect(HALF_LIFE_DETENTS).toHaveLength(6);
    expect(HALF_LIFE_DETENTS[5]).toBe(0);
  });

  it('HALF_LIFE_LABELS has 6 entries', () => {
    expect(HALF_LIFE_LABELS).toHaveLength(6);
    expect(HALF_LIFE_LABELS[5]).toBe('∞');
  });

  it('CHARACTER_DETENTS has 6 entries', () => {
    expect(CHARACTER_DETENTS).toHaveLength(6);
    expect(CHARACTER_DETENTS[0]).toBe(-5);
    expect(CHARACTER_DETENTS[5]).toBe(5);
  });

  it('CHARACTER_LABELS has 6 entries', () => {
    expect(CHARACTER_LABELS).toHaveLength(6);
  });
});

describe('defaultKnobState', () => {
  it('returns a valid state', () => {
    const state = defaultKnobState();
    expect(state.recency).toBeGreaterThanOrEqual(0);
    expect(state.recency).toBeLessThanOrEqual(5);
    expect(state.likes).toBeGreaterThanOrEqual(0);
    expect(state.likes).toBeLessThanOrEqual(5);
    expect(state.comments).toBeGreaterThanOrEqual(0);
    expect(state.comments).toBeLessThanOrEqual(5);
    expect(state.halfLife).toBeGreaterThanOrEqual(0);
    expect(state.halfLife).toBeLessThanOrEqual(5);
    expect(state.character).toBeGreaterThanOrEqual(0);
    expect(state.character).toBeLessThanOrEqual(5);
  });
});

describe('presets', () => {
  it('has 4 presets', () => {
    expect(PRESETS).toHaveLength(4);
  });

  it('most-recent has only recency weight, all-time half-life', () => {
    const p = getPreset('most-recent');
    expect(p).toBeDefined();
    expect(p!.state.recency).toBe(5); // max weight
    expect(p!.state.likes).toBe(0);
    expect(p!.state.comments).toBe(0);
  });

  it('most-liked has only likes weight, infinite half-life', () => {
    const p = getPreset('most-liked');
    expect(p).toBeDefined();
    expect(p!.state.recency).toBe(0);
    expect(p!.state.likes).toBe(5);
    expect(p!.state.comments).toBe(0);
    expect(p!.state.halfLife).toBe(5); // ∞
  });

  it('most-commented has only comments weight, infinite half-life', () => {
    const p = getPreset('most-commented');
    expect(p).toBeDefined();
    expect(p!.state.recency).toBe(0);
    expect(p!.state.likes).toBe(0);
    expect(p!.state.comments).toBe(5);
    expect(p!.state.halfLife).toBe(5); // ∞
  });

  it('balanced exists', () => {
    const p = getPreset('balanced');
    expect(p).toBeDefined();
  });
});

describe('mix code', () => {
  it('round-trips encode → decode', () => {
    const state = { recency: 4, likes: 0, comments: 2, halfLife: 1, character: 3 };
    const code = encodeMix(state);
    const decoded = decodeMix(code);
    expect(decoded).toEqual(state);
  });

  it('produces a 5-digit code', () => {
    const state = defaultKnobState();
    const code = encodeMix(state);
    expect(code).toMatch(/^\d{5}$/);
  });

  it('all-zero state encodes to 00000', () => {
    const state = { recency: 0, likes: 0, comments: 0, halfLife: 0, character: 0 };
    expect(encodeMix(state)).toBe('00000');
  });

  it('all-max state encodes to a valid code and round-trips', () => {
    const state = { recency: 5, likes: 5, comments: 5, halfLife: 5, character: 5 };
    const code = encodeMix(state);
    expect(code).toMatch(/^\d{5}$/);
    expect(decodeMix(code)).toEqual(state);
  });

  it('invalid codes return null', () => {
    expect(decodeMix('99999')).toBeNull();
    expect(decodeMix('abcde')).toBeNull();
    expect(decodeMix('-1')).toBeNull();
  });

  it('preset codes are distinct', () => {
    const codes = new Set(PRESETS.map(p => encodeMix(p.state)));
    expect(codes.size).toBe(4);
  });
});

describe('scorePost', () => {
  it('pins the exponent at the middle detent (p = 0, geometric) — the Character knob is gone', () => {
    // Parity with web10-social: the exponent is fixed at the middle, so a
    // post is scored on the balance of its signals (no signal dominates).
    expect(CHARACTER_DETENTS[FIXED_CHARACTER_DETEENT]).toBe(0);
    expect(FIXED_CHARACTER_P).toBe(0);
  });

  it('ignores state.character (the knob is gone — the exponent is fixed)', () => {
    // Two states identical except for `character` (Strict p=-5 vs Extreme
    // p=+5) must score identically — the ranking no longer reads it.
    const signals = { ageMs: 3_600_000, likes: 42, comments: 7, reposts: 0 };
    const strict = scorePost(signals, { recency: 3, likes: 3, comments: 2, halfLife: 3, character: 0 });
    const extreme = scorePost(signals, { recency: 3, likes: 3, comments: 2, halfLife: 3, character: 5 });
    expect(strict).toBe(extreme);
  });

  it('pins the recency half-life at the middle detent (1 day) — the Time knob is gone', () => {
    // Parity with web10-social: the half-life is fixed at the middle (1 day),
    // so recent posts are weighted but not exclusively.
    expect(HALF_LIFE_DETENTS[FIXED_HALF_LIFE_DETEENT]).toBe(86_400_000); // 1d
    expect(FIXED_HALF_LIFE_MS).toBe(86_400_000);
  });

  it('ignores state.halfLife (the knob is gone — the half-life is fixed)', () => {
    // Two states identical except for `halfLife` (∞ vs 1h) must score
    // identically — the ranking no longer reads it.
    const signals = { ageMs: 3_600_000, likes: 42, comments: 7, reposts: 0 };
    const allTime = scorePost(signals, { recency: 3, likes: 3, comments: 2, halfLife: 5, character: 0 });
    const oneHour = scorePost(signals, { recency: 3, likes: 3, comments: 2, halfLife: 0, character: 0 });
    expect(allTime).toBe(oneHour);
  });

  it('most-recent preset scores by recency only (negative age for reverse-chron)', () => {
    const newest = getPreset('most-recent')!.state;
    const fresh = scorePost({ ageMs: 100, likes: 0, comments: 0, reposts: 0 }, newest);
    const old = scorePost({ ageMs: 1_000_000, likes: 1000, comments: 500, reposts: 100 }, newest);
    // Negative age: -100 > -1_000_000, so fresh wins
    expect(fresh).toBeGreaterThan(old);
  });

  it('most-liked preset ignores age', () => {
    const ml = getPreset('most-liked')!.state;
    const freshLow = scorePost({ ageMs: 0, likes: 1, comments: 0, reposts: 0 }, ml);
    const oldHigh = scorePost({ ageMs: 1_000_000_000, likes: 1000, comments: 0, reposts: 0 }, ml);
    expect(oldHigh).toBeGreaterThan(freshLow);
  });

  it('cranked recency prioritizes today over a little engagement on an old post (the potency fix)', () => {
    // Operator: "when i crank it up and have likes and comments just a little
    // bit it gets dominated by likes and comments". At the top recency detent
    // a fresh zero-engagement post must beat a two-day-old post with a few
    // likes/comments. (Before the fix the 1e-12 dead-signal floor made that
    // old post win by ~500×, no matter how far recency was cranked.)
    const cranked = { recency: 5, likes: 1, comments: 1, halfLife: 3, character: 0 };
    const hourOld = { ageMs: 3_600_000, likes: 0, comments: 0, reposts: 0 };
    const twoDaysOld = { ageMs: 2 * 86_400_000, likes: 3, comments: 1, reposts: 0 };
    expect(scorePost(hourOld, cranked)).toBeGreaterThan(scorePost(twoDaysOld, cranked));
  });

  it('low recency detents keep engagement potency (the knob does not snap to chronological)', () => {
    // At the bottom of the steeper scale (0.5) a genuinely viral old post
    // still beats a fresh zero-engagement one — resolution across the range.
    const lowRecency = { recency: 1, likes: 5, comments: 0, halfLife: 3, character: 0 };
    const hourOld = { ageMs: 3_600_000, likes: 0, comments: 0, reposts: 0 };
    const twoDaysViral = { ageMs: 2 * 86_400_000, likes: 200, comments: 50, reposts: 0 };
    expect(scorePost(twoDaysViral, lowRecency)).toBeGreaterThan(scorePost(hourOld, lowRecency));
  });
});

describe('rankPosts', () => {
  it('sorts descending by score', () => {
    const posts = [
      { id: 'a', ageMs: 1000, likes: 100, comments: 10, reposts: 5 },
      { id: 'b', ageMs: 500, likes: 1, comments: 0, reposts: 0 },
    ];
    const ranked = rankPosts(posts, p => p, defaultKnobState());
    expect(ranked[0].id).toBe('a');
  });

  it('does not mutate original array', () => {
    const posts = [
      { id: 'a', ageMs: 1000, likes: 1, comments: 0, reposts: 0 },
      { id: 'b', ageMs: 100, likes: 100, comments: 10, reposts: 5 },
    ];
    const orig = [...posts];
    rankPosts(posts, p => p, defaultKnobState());
    expect(posts).toEqual(orig);
  });

  it('most-recent preset sorts by age ascending (newest first)', () => {
    const posts = [
      { id: 'old', ageMs: 1_000_000, likes: 999, comments: 999, reposts: 999 },
      { id: 'new', ageMs: 100, likes: 0, comments: 0, reposts: 0 },
    ];
    const ranked = rankPosts(posts, p => p, getPreset('most-recent')!.state);
    expect(ranked[0].id).toBe('new');
  });
});