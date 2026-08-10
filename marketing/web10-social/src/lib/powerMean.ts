// lib/powerMean.ts — pure, set-independent ranking math for Discover presets.
// SOURCE OF TRUTH: marketing/marketing-ui/src/lib/powerMean.ts — sync, don't fork.

// ── Normalizers (set-independent, saturating) ──────────────────────────────

const K_LIKES = 1;
const K_COMMENTS = 0.5;
const K_REPOSTS = 0.3;

function saturate(value: number, k: number): number {
  return value / (1 + value);
}

function normalizeRecency(ageMs: number, halfLifeMs: number): number {
  if (halfLifeMs <= 0) return 1;
  return Math.exp(-ageMs / halfLifeMs);
}

function normalizeLikes(likes: number): number {
  return saturate(Math.log1p(likes), K_LIKES);
}

function normalizeComments(comments: number): number {
  return saturate(Math.log1p(comments), K_COMMENTS);
}

function normalizeReposts(reposts: number): number {
  return saturate(Math.log1p(reposts), K_REPOSTS);
}

// ── Weighted Power Mean ─────────────────────────────────────────────────────

const EPSILON = 1e-12;

function floorSignal(x: number): number {
  return Math.max(EPSILON, Math.min(1, x));
}

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

const WEIGHT_DETENTS = [0, 0.2, 0.4, 0.6, 0.8, 1];

const HALF_LIFE_DETENTS = [
  3_600_000,
  14_400_000,
  43_200_000,
  86_400_000,
  604_800_000,
  0,
];
const HALF_LIFE_LABELS = ['1h', '4h', '12h', '1d', '7d', '∞'];

const CHARACTER_DETENTS = [-5, -2.5, -1, 0, 1, 5];
const CHARACTER_LABELS = ['Strict', 'Tight', 'Flat', 'Mean', 'Loose', 'Extreme'];

// ── Knob State ──────────────────────────────────────────────────────────────

interface KnobState {
  recency: number;
  likes: number;
  comments: number;
  halfLife: number;
  character: number;
}

function defaultKnobState(): KnobState {
  return { recency: 3, likes: 3, comments: 2, halfLife: 3, character: 2 };
}

// ── Presets ─────────────────────────────────────────────────────────────────

export type PresetId = 'newest' | 'most-loved' | 'balanced';

interface Preset {
  id: PresetId;
  label: string;
  state: KnobState;
}

export const PRESETS: Preset[] = [
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

export function getPreset(id: PresetId): Preset | undefined {
  return PRESETS.find(p => p.id === id);
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

  if (wr > 0 && wl <= 0 && wc <= 0) {
    return -signals.ageMs;
  }

  return weightedPowerMean(
    [r, l, c, rp],
    [wr, wl, wc, 0],
    p,
  );
}

// ── Rank Posts ──────────────────────────────────────────────────────────────

export function rankPosts<T extends { _id?: string; created_at: string }>(
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

export type { KnobState, PostSignals };

export {
  WEIGHT_DETENTS,
  HALF_LIFE_DETENTS,
  HALF_LIFE_LABELS,
  CHARACTER_DETENTS,
  CHARACTER_LABELS,
  defaultKnobState,
  scorePost,
};