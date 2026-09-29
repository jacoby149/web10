// lib/watchQueue.ts — the watch page's "What's next" queue re-rank.
//
// The queue is the Discover board the fan already had, re-ranked for
// similarity to the current video (watch-page.md). No new API call, no
// server-side similarity engine, no new collection — a client-side re-rank of
// the loaded board.
//
// The score: the knob ranking (the D36 power-mean score, the same function the
// board uses for its display score) is the FLOOR; a similarity boost is the
// MULTIPLIER. The boost is a plain-English "Relatedness" preset, not a
// hardcoded constant (the operator: "should be configurable knobs, all feed is
// tunable in web10, but reasonable defaults to set") — the same "named
// concept, not a raw dial" rule that killed the Character + Time knobs (D36).

import { scorePost, type KnobState, type PostSignals } from './powerMean';

// ── The Relatedness presets (the plain-English "how much to tilt") ──────────

export type RelatednessId =
  | 'mixed'
  | 'more-like-this'
  | 'same-creator'
  | 'just-the-feed';

export interface RelatednessPreset {
  id: RelatednessId;
  label: string;
  /** How hard the queue leans on the post's TAGS (topic similarity). */
  tagWeight: number;
  /** How hard the queue leans on the post's AUTHOR (same-creator). */
  authorWeight: number;
}

// The default is Mixed — a balance of similar topics + same creator (the
// reasonable default the operator asked for). A fan who never touches it gets
// a balanced "what's next."
export const RELATEDNESS_PRESETS: RelatednessPreset[] = [
  { id: 'mixed', label: 'Mixed', tagWeight: 0.5, authorWeight: 0.3 },
  { id: 'more-like-this', label: 'More like this', tagWeight: 0.8, authorWeight: 0.1 },
  { id: 'same-creator', label: 'Same creator', tagWeight: 0.1, authorWeight: 0.8 },
  { id: 'just-the-feed', label: 'Just the feed', tagWeight: 0, authorWeight: 0 },
];

export const DEFAULT_RELATEDNESS: RelatednessId = 'mixed';

export function getRelatedness(id: string | null | undefined): RelatednessPreset {
  return RELATEDNESS_PRESETS.find((p) => p.id === id) ?? RELATEDNESS_PRESETS[0];
}

// ── ?related= URL encoding (the deep-link rule) ─────────────────────────────
// The param is omitted when at the default (Mixed), so the default URL stays
// clean — the same idiom as ?knobs=.

export function parseRelatednessParam(raw: string | null): RelatednessId | null {
  if (!raw) return null;
  return RELATEDNESS_PRESETS.some((p) => p.id === raw) ? (raw as RelatednessId) : null;
}

export function encodeRelatednessParam(id: RelatednessId): string {
  return id === DEFAULT_RELATEDNESS ? '' : id;
}

// ── The queue re-rank ───────────────────────────────────────────────────────

// The minimal post shape the re-rank needs. The app's PostRecord satisfies it
// (a superset); the tests can pass bare objects.
export interface WatchQueuePost {
  _id?: string;
  created_at: string;
  likes?: number;
  comments?: number;
  reposts?: number;
  tags?: string[];
  author_username?: string;
}

/**
 * Re-rank the loaded board for the watch page's "What's next" queue.
 *
 * `queue_score(post) = knob_score(post) × (1 + tagWeight·|tags ∩| + authorWeight·[same author])`
 *
 * - The knob score is the FLOOR (the fan's ranking preference governs the base
 *   order); the similarity is the MULTIPLIER (it tilts, it doesn't filter).
 * - A post with zero shared tags and a different author still appears — just
 *   lower.
 * - The current post is excluded (it is playing).
 * - The boost only tilts a POSITIVE-valued ranking. For the Most Recent preset
 *   (pure chronological — `scorePost` returns a negative `-ageMs`), the boost
 *   is a no-op: a chronological feed is chronological, no similarity tilt.
 */
export function rankWatchQueue<T extends WatchQueuePost>(
  posts: T[],
  current: WatchQueuePost,
  knobState: KnobState,
  relatedness: RelatednessId,
): T[] {
  const preset = getRelatedness(relatedness);
  const currentTags = new Set(current.tags ?? []);
  const currentAuthor = current.author_username ?? '';
  const now = Date.now();

  const scored = posts
    .filter((p) => p._id !== current._id)
    .map((p) => {
      const sharedTags = (p.tags ?? []).filter((t) => currentTags.has(t)).length;
      const sameAuthor = currentAuthor !== '' && (p.author_username ?? '') === currentAuthor;
      const boost = 1 + preset.tagWeight * sharedTags + preset.authorWeight * (sameAuthor ? 1 : 0);
      const signals: PostSignals = {
        ageMs: now - new Date(p.created_at).getTime(),
        likes: p.likes || 0,
        comments: p.comments || 0,
        reposts: p.reposts || 0,
      };
      const base = scorePost(signals, knobState);
      // The boost only tilts a positive-valued ranking (the power-mean presets).
      // Most Recent returns a negative -ageMs (pure chronological) — no tilt.
      const score = base >= 0 ? base * boost : base;
      return { post: p, score };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.post);
}
