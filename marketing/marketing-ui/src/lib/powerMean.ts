// lib/powerMean.ts — pure, set-independent ranking math for /trending knobs.
//
// The weighted power mean lets the user hold every parameter of the
// ranking function. All normalizers are saturating curves so a post's
// score is independent of what else was fetched (v0 client = v1 server).

// ── Normalizers (set-independent, saturating) ──────────────────────────────

// K constants chosen so a "good" count lands ~0.5 on the (0,1] scale.
const K_LIKES = 1;       // log10(1+10) ≈ 1.04 → 1.04/(1+1.04) ≈ 0.51
const K_COMMENTS = 0.5;  // log10(1+3) ≈ 0.60 → 0.60/(1+0.60) ≈ 0.37
const K_REPOSTS = 0.3;   // log10(1+2) ≈ 0.48 → 0.48/(1+0.48) ≈ 0.32

function saturate(value: number, k: number): number {
  return value / (1 + value);
}

// Recency: exponential decay. halfLifeMs = 0 means "all time" (R = 1).
function normalizeRecency(ageMs: number, halfLifeMs: number): number {
  if (halfLifeMs <= 0) return 1;
  return Math.exp(-ageMs / halfLifeMs);
}

// Likes: log1p then saturate.
function normalizeLikes(likes: number): number {
  return saturate(Math.log1p(likes), K_LIKES);
}

// Comments: log1p then saturate.
function normalizeComments(comments: number): number {
  return saturate(Math.log1p(comments), K_COMMENTS);
}

// Reposts: log1p then saturate.
function normalizeReposts(reposts: number): number {
  return saturate(Math.log1p(reposts), K_REPOSTS);
}

// ── Weighted Power Mean ─────────────────────────────────────────────────────

// p → ±∞ limits, p = 0 geometric mean, weight-zeroing.
// Signals are floored to epsilon so p <= 0 never nukes a post for one dead signal.
const EPSILON = 1e-12;

function floorSignal(x: number): number {
  return Math.max(EPSILON, Math.min(1, x));
}

/**
 * Weighted power mean of normalized signals.
 *
 * score = (Σ wᵢ·xᵢ^p / Σ wᵢ)^(1/p)
 * p = 0 → exp(Σ wᵢ·ln(xᵢ) / Σ wᵢ)  (weighted geometric mean)
 *
 * Zero-weighted signals are excluded from both numerator and denominator.
 */
function weightedPowerMean(
  signals: number[],
  weights: number[],
  p: number,
): number {
  const n = signals.length;
  let totalWeight = 0;
  let sum = 0;

  for (let i = 0; i < n; i++) {
    if (weights[i] <= 0) continue;
    const x = floorSignal(signals[i]);
    totalWeight += weights[i];
    if (Math.abs(p) < 1e-9) {
      // geometric mean: exp(Σ wᵢ·ln(xᵢ) / Σ wᵢ)
      sum += weights[i] * Math.log(x);
    } else {
      sum += weights[i] * Math.pow(x, p);
    }
  }

  if (totalWeight <= 0) return 0;

  if (Math.abs(p) < 1e-9) {
    return Math.exp(sum / totalWeight);
  }
  return Math.pow(sum / totalWeight, 1 / p);
}

// ── Detents ─────────────────────────────────────────────────────────────────

// Each knob has 6 detents (indices 0..5).

// Weight detents: 0, 0.2, 0.4, 0.6, 0.8, 1.0
const WEIGHT_DETENTS = [0, 0.2, 0.4, 0.6, 0.8, 1];

// Time horizon half-life (ms): 1h, 4h, 12h, 1d, 7d, ∞
const HALF_LIFE_DETENTS = [
  3_600_000,        // 1 hour
  14_400_000,       // 4 hours
  43_200_000,       // 12 hours
  86_400_000,       // 1 day
  604_800_000,      // 7 days
  0,                // ∞ (all time)
];
const HALF_LIFE_LABELS = ['1h', '4h', '12h', '1d', '7d', '∞'];

// Character p: -5, -2.5, -1, 0, +1, +5
const CHARACTER_DETENTS = [-5, -2.5, -1, 0, 1, 5];
const CHARACTER_LABELS = ['Strict', 'Tight', 'Flat', 'Mean', 'Loose', 'Extreme'];

// ── Knob State ──────────────────────────────────────────────────────────────

interface KnobState {
  recency: number;    // detent index 0..5
  likes: number;      // detent index 0..5
  comments: number;   // detent index 0..5
  halfLife: number;   // detent index 0..5
  character: number;  // detent index 0..5
}

function defaultKnobState(): KnobState {
  return { recency: 3, likes: 3, comments: 2, halfLife: 3, character: 2 };
}

// ── Presets ─────────────────────────────────────────────────────────────────

type PresetId = 'newest' | 'most-loved' | 'balanced';

interface Preset {
  id: PresetId;
  label: string;
  state: KnobState;
}

const PRESETS: Preset[] = [
  {
    id: 'newest',
    label: 'Newest',
    state: { recency: 5, likes: 0, comments: 0, halfLife: 0, character: 0 },
  },
  {
    id: 'most-loved',
    label: 'Most loved · all time',
    state: { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    state: defaultKnobState(),
  },
];

function getPreset(id: PresetId): Preset | undefined {
  return PRESETS.find(p => p.id === id);
}

// ── Mix Code (shareable URL hash) ───────────────────────────────────────────

// Encodes 5 detents (each 0..5) into a base-6 integer, then to a 5-digit
// string. 6^5 = 7776 combos → fits in 5 decimal digits with leading zeros.

function encodeMix(state: KnobState): string {
  const digits = [
    state.recency,
    state.likes,
    state.comments,
    state.halfLife,
    state.character,
  ];
  let value = 0;
  for (const d of digits) {
    value = value * 6 + d;
  }
  return String(value).padStart(5, '0');
}

function decodeMix(code: string): KnobState | null {
  const num = parseInt(code, 10);
  if (isNaN(num) || num < 0 || num >= 7776) return null;
  const digits: number[] = [];
  let v = num;
  for (let i = 0; i < 5; i++) {
    digits.unshift(v % 6);
    v = Math.floor(v / 6);
  }
  return {
    recency: digits[0],
    likes: digits[1],
    comments: digits[2],
    halfLife: digits[3],
    character: digits[4],
  };
}

// ── Score a Post ────────────────────────────────────────────────────────────

interface PostSignals {
  ageMs: number;
  likes: number;
  comments: number;
  reposts: number;
}

function scorePost(signals: PostSignals, state: KnobState): number {
  const wr = WEIGHT_DETENTS[state.recency];
  const wl = WEIGHT_DETENTS[state.likes];
  const wc = WEIGHT_DETENTS[state.comments];
  const halfLife = HALF_LIFE_DETENTS[state.halfLife];
  const p = CHARACTER_DETENTS[state.character];

  const r = normalizeRecency(signals.ageMs, halfLife);
  const l = normalizeLikes(signals.likes);
  const c = normalizeComments(signals.comments);
  const rp = normalizeReposts(signals.reposts);

  // If recency weight is the only non-zero weight, use pure reverse-chron
  // ordering (the "Newest" preset guarantees this regardless of engagement).
  // Return negative age so newer posts score higher.
  if (wr > 0 && wl <= 0 && wc <= 0) {
    return -signals.ageMs;
  }

  return weightedPowerMean(
    [r, l, c, rp],
    [wr, wl, wc, 0], // reposts always weight 0 (not a knob yet)
    p,
  );
}

// ── Rank Posts ──────────────────────────────────────────────────────────────

function rankPosts<T extends { id: string }>(
  posts: T[],
  signalsFn: (post: T) => PostSignals,
  state: KnobState,
): T[] {
  return [...posts].sort((a, b) => {
    const sa = signalsFn(a);
    const sb = signalsFn(b);
    const scoreA = scorePost(sa, state);
    const scoreB = scorePost(sb, state);
    return scoreB - scoreA;
  });
}

export {
  // Normalizers
  normalizeRecency,
  normalizeLikes,
  normalizeComments,
  normalizeReposts,
  // Power mean
  weightedPowerMean,
  // Detents
  WEIGHT_DETENTS,
  HALF_LIFE_DETENTS,
  HALF_LIFE_LABELS,
  CHARACTER_DETENTS,
  CHARACTER_LABELS,
  // State
  defaultKnobState,
  type KnobState,
  // Presets
  PRESETS,
  getPreset,
  type Preset,
  type PresetId,
  // Mix code
  encodeMix,
  decodeMix,
  // Scoring
  scorePost,
  rankPosts,
  type PostSignals,
};