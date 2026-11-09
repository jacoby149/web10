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

// A dead (zeroed) weighted signal is floored to a small share of the
// normalized scale, not to epsilon: with a 1e-12 floor the geometric mean
// cost one dead signal ln(1e-12) ≈ 27.6 log points — a near-veto. "A little"
// engagement on an old post then outranked a fresh one no matter how far the
// Recency knob was cranked, which is why recency read as powerless. At the
// 0.05 floor a dead signal costs ln(0.05) ≈ 3 log points: it still ranks
// below a real one, without annihilating the post.
const SIGNAL_FLOOR = 0.05;

function floorSignal(x: number): number {
  return Math.max(SIGNAL_FLOOR, Math.min(1, x));
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

// Weight detents (likes / comments): 0, 0.2, 0.4, 0.6, 0.8, 1.0
const WEIGHT_DETENTS = [0, 0.2, 0.4, 0.6, 0.8, 1];

// Recency detents: 0, 0.5, 1, 2, 4, 8 — each step doubles recency's pull.
// Recency is the signal that reads as "the feed went stale", and the power
// mean compares signals by RELATIVE weight, so the Recency knob carries its
// own steeper scale: at the top detent (8.0) it outweighs likes + comments at
// their combined max (1.0 + 1.0) four-fold — a cranked Recency prioritizes
// today's posts, even the last hour, over a little engagement on older ones.
// At the low detents (0.5 / 1.0) strong engagement still wins, so the knob
// keeps real resolution across its range instead of snapping between "off"
// and "chronological".
const RECENCY_WEIGHTS = [0, 0.5, 1, 2, 4, 8];

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

// The Character knob is gone from the rack (operator: "i dont even know what
// that means" — the obfuscated math dial had no plain-English concept, and it
// was the 5th knob forcing the mobile sideways scroll). The exponent is fixed
// at the middle detent — p = 0, the weighted geometric mean: no signal
// dominates, a post is scored on the balance of its signals. `character`
// stays in KnobState so the ?knobs= encoding and the persisted settings doc
// keep their 5-field shape (old deep links + saved tunings still parse).
export const FIXED_CHARACTER_DETEENT = 3;

/** The fixed power-mean exponent the node ranks with (p = 0, geometric). */
export const FIXED_CHARACTER_P = CHARACTER_DETENTS[FIXED_CHARACTER_DETEENT];

// The Time knob is gone from the rack (operator: "the time knob is too
// complex … we should just set that to something sensible for the user").
// It was the recency half-life — the window over which a post's "newness"
// decays — and it was the obfuscated math dial with no plain-English concept
// (1h / 4h / 12h / 1d / 7d / ∞). The half-life is now fixed at the middle
// detent — 1 day: recent posts are weighted but not exclusively, the sensible
// default for a social feed. `halfLife` stays in KnobState so the ?knobs=
// encoding + the persisted settings doc keep their 5-field shape (old deep
// links + saved tunings still parse); the ranking just ignores it.
export const FIXED_HALF_LIFE_DETEENT = 3;

/** The fixed recency half-life the node ranks with (1 day). */
export const FIXED_HALF_LIFE_MS = HALF_LIFE_DETENTS[FIXED_HALF_LIFE_DETEENT];

// The server-side ranking config (the SDK's PowerMeanSort shape —
// api/app/v3/models/documents.py). The node scores every readable post with
// the weighted power mean and returns pre-sorted results, so a knob twist is
// a re-read, not a client-side shuffle of the same 50.
export interface PowerMeanSortConfig {
  recency: number;
  likes: number;
  comments: number;
  half_life_ms: number;
  character: number;
}

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

export type PresetId = 'most-recent' | 'most-liked' | 'most-commented' | 'balanced';

interface Preset {
  id: PresetId;
  label: string;
  state: KnobState;
}

export const PRESETS: Preset[] = [
  {
    id: 'most-recent',
    label: 'Most recent',
    state: { recency: 5, likes: 0, comments: 0, halfLife: 0, character: 0 },
  },
  {
    id: 'most-liked',
    label: 'Most liked',
    state: { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 },
  },
  {
    id: 'most-commented',
    label: 'Most commented',
    state: { recency: 0, likes: 0, comments: 5, halfLife: 5, character: 0 },
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
  // Recency takes its own steeper detents (0 → 8) so the top of the knob can
  // outweigh the engagement knobs' combined max (see RECENCY_WEIGHTS).
  const wr = RECENCY_WEIGHTS[state.recency];
  const wl = WEIGHT_DETENTS[state.likes];
  const wc = WEIGHT_DETENTS[state.comments];
  // The Time knob is gone — the recency half-life is fixed at the middle
  // (1 day). `state.halfLife` is kept for ?knobs= / settings compat but no
  // longer drives the ranking.
  const halfLife = FIXED_HALF_LIFE_MS;
  // The Character knob is gone — the exponent is fixed at the middle
  // (p = 0, geometric). `state.character` is kept for ?knobs= / mix-code
  // compat but no longer drives the ranking.
  const p = FIXED_CHARACTER_P;

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

// The server-side power-mean sort config (D69): the knob state's detent
// indices resolved to the float weights the node's `_power_mean_score_sql`
// consumes (the same normalizers, so the node ranks identically to the client).
// `null` = the Newest preset (chronological — the node orders by created_at and
// the cursor rides on created_at, not the score).
export type FeedRankSort = PowerMeanSortConfig | null;

export function knobStateToSort(state: KnobState): FeedRankSort {
  // Recency resolves through the steeper detents (0 → 8); likes / comments
  // keep the shared 0..1 scale.
  const recency = RECENCY_WEIGHTS[state.recency];
  const likes = WEIGHT_DETENTS[state.likes];
  const comments = WEIGHT_DETENTS[state.comments];
  // The Newest preset (recency-only, no likes/comments weight) → chronological
  // (null sort → the node orders by created_at, cursor on created_at).
  if (likes <= 0 && comments <= 0) return null;
  return {
    recency,
    likes,
    comments,
    // The Time knob is gone — the recency half-life is fixed at the middle
    // (1 day). `state.halfLife` is kept for ?knobs= / settings compat but no
    // longer drives the ranking.
    half_life_ms: FIXED_HALF_LIFE_MS,
    // The Character knob is gone — the exponent is fixed at the middle
    // (p = 0, geometric). `state.character` is kept for ?knobs= / mix-code
    // compat but no longer drives the ranking.
    character: FIXED_CHARACTER_P,
  };
}

export {
  WEIGHT_DETENTS,
  RECENCY_WEIGHTS,
  HALF_LIFE_DETENTS,
  HALF_LIFE_LABELS,
  CHARACTER_DETENTS,
  CHARACTER_LABELS,
  defaultKnobState,
  scorePost,
};