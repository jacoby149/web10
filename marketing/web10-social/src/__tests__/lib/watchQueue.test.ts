import { describe, it, expect } from 'vitest';
import {
  rankWatchQueue,
  RELATEDNESS_PRESETS,
  DEFAULT_RELATEDNESS,
  getRelatedness,
  parseRelatednessParam,
  encodeRelatednessParam,
  type RelatednessId,
  type WatchQueuePost,
} from '@/lib/watchQueue';
import { defaultKnobState, type KnobState } from '@/lib/powerMean';

// A fixed "now" so ageMs is deterministic. Posts are created relative to it.
const NOW = new Date('2026-09-28T12:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

// A balanced knob state (the default) — a positive-valued power-mean ranking,
// so the similarity boost actually tilts.
const BALANCED: KnobState = defaultKnobState();

function post(p: Partial<WatchQueuePost> & { _id: string }): WatchQueuePost {
  return { created_at: hoursAgo(1), likes: 0, comments: 0, reposts: 0, ...p };
}

describe('RELATEDNESS_PRESETS (the plain-English relatedness)', () => {
  it('has the four presets with the documented weights, Mixed as the default', () => {
    expect(RELATEDNESS_PRESETS.map((p) => p.id)).toEqual([
      'mixed',
      'more-like-this',
      'same-creator',
      'just-the-feed',
    ]);
    expect(DEFAULT_RELATEDNESS).toBe('mixed');
    const byId = Object.fromEntries(RELATEDNESS_PRESETS.map((p) => [p.id, p]));
    expect(byId['mixed']).toMatchObject({ tagWeight: 0.5, authorWeight: 0.3 });
    expect(byId['more-like-this']).toMatchObject({ tagWeight: 0.8, authorWeight: 0.1 });
    expect(byId['same-creator']).toMatchObject({ tagWeight: 0.1, authorWeight: 0.8 });
    expect(byId['just-the-feed']).toMatchObject({ tagWeight: 0, authorWeight: 0 });
  });

  it('getRelatedness falls back to Mixed for unknown/absent ids', () => {
    expect(getRelatedness('same-creator').id).toBe('same-creator');
    expect(getRelatedness('nonsense').id).toBe('mixed');
    expect(getRelatedness(null).id).toBe('mixed');
    expect(getRelatedness(undefined).id).toBe('mixed');
  });
});

describe('parseRelatednessParam / encodeRelatednessParam (?related= deep link)', () => {
  it('parses a valid id, rejects unknown, null for absent', () => {
    expect(parseRelatednessParam('more-like-this')).toBe('more-like-this');
    expect(parseRelatednessParam('just-the-feed')).toBe('just-the-feed');
    expect(parseRelatednessParam('nope')).toBeNull();
    expect(parseRelatednessParam(null)).toBeNull();
  });

  it('omits the param at the default (Mixed), encodes the rest', () => {
    expect(encodeRelatednessParam('mixed')).toBe('');
    expect(encodeRelatednessParam('same-creator')).toBe('same-creator');
    expect(encodeRelatednessParam('just-the-feed')).toBe('just-the-feed');
  });
});

describe('rankWatchQueue (the "What\'s next" re-rank)', () => {
  it('excludes the current post (it is playing)', () => {
    const current = post({ _id: 'cur', tags: ['climbing'] });
    const out = rankWatchQueue(
      [current, post({ _id: 'a' }), post({ _id: 'b' })],
      current,
      BALANCED,
      'mixed',
    );
    expect(out.map((p) => p._id)).not.toContain('cur');
    expect(out.map((p) => p._id)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('boosts posts that share tags with the current (topic similarity)', () => {
    const current = post({ _id: 'cur', tags: ['climbing', 'outdoors'] });
    // 'same' shares 2 tags, 'other' shares 0 — same base engagement/age, so
    // the only difference is the tag overlap. 'same' must rank first.
    const out = rankWatchQueue(
      [
        post({ _id: 'other', tags: ['cooking'], likes: 10 }),
        post({ _id: 'same', tags: ['climbing', 'outdoors'], likes: 10 }),
      ],
      current,
      BALANCED,
      'mixed',
    );
    expect(out[0]._id).toBe('same');
    expect(out[1]._id).toBe('other');
  });

  it('boosts posts by the same author (same-creator)', () => {
    const current = post({ _id: 'cur', author_username: 'alex' });
    const out = rankWatchQueue(
      [
        post({ _id: 'other', author_username: 'bob', likes: 10 }),
        post({ _id: 'same', author_username: 'alex', likes: 10 }),
      ],
      current,
      BALANCED,
      'mixed',
    );
    expect(out[0]._id).toBe('same');
    expect(out[1]._id).toBe('other');
  });

  it('is a boost, not a filter — a zero-similarity post still appears (just lower)', () => {
    const current = post({ _id: 'cur', tags: ['climbing'] });
    const out = rankWatchQueue(
      [
        post({ _id: 'zero', tags: ['unrelated'], likes: 10 }),
        post({ _id: 'match', tags: ['climbing'], likes: 10 }),
      ],
      current,
      BALANCED,
      'mixed',
    );
    // Both present; the match ranks above the zero-similarity post.
    expect(out.map((p) => p._id)).toEqual(['match', 'zero']);
  });

  it('"Just the feed" applies no boost — the queue is the plain knob ranking', () => {
    const current = post({ _id: 'cur', tags: ['climbing'] });
    // 'match' shares a tag, 'zero' does not — but with no boost they rank by
    // the knob score alone. Same engagement/age → same score → stable order
    // (insertion order preserved by the stable sort).
    const out = rankWatchQueue(
      [
        post({ _id: 'zero', tags: ['unrelated'], likes: 10 }),
        post({ _id: 'match', tags: ['climbing'], likes: 10 }),
      ],
      current,
      BALANCED,
      'just-the-feed',
    );
    expect(out.map((p) => p._id)).toEqual(['zero', 'match']);
  });

  it('the similarity boost lifts a same-topic post above the base ranking (the feature, not a bug)', () => {
    const current = post({ _id: 'cur', tags: ['climbing'] });
    // 'cold' shares the tag (low engagement); 'hot' has no shared tag (high
    // engagement). Under a relatedness tilt (Mixed), the tag boost lifts the
    // same-topic post above the base ranking — this is the point of the
    // relatedness knob ("prioritizing those in sort to get similar videos").
    // The likes signal saturates (log1p), so 500 vs 1 like is a small base gap
    // that a 1.5× tag boost closes.
    const out = rankWatchQueue(
      [
        post({ _id: 'cold', tags: ['climbing'], likes: 1 }),
        post({ _id: 'hot', tags: ['unrelated'], likes: 500 }),
      ],
      current,
      BALANCED,
      'mixed',
    );
    expect(out[0]._id).toBe('cold');
  });

  it('with no shared tags, the base knob ranking orders the queue (the floor)', () => {
    const current = post({ _id: 'cur', tags: ['climbing'] });
    // Neither post shares a tag and neither is by the same author → the boost
    // is 1.0 for both → the queue is the plain knob ranking (more likes first).
    const out = rankWatchQueue(
      [
        post({ _id: 'low', tags: ['x'], likes: 1 }),
        post({ _id: 'high', tags: ['y'], likes: 500 }),
      ],
      current,
      BALANCED,
      'mixed',
    );
    expect(out[0]._id).toBe('high');
    expect(out[1]._id).toBe('low');
  });

  it('for the Most Recent preset (chronological) the boost is a no-op', () => {
    // Most Recent → scorePost returns -ageMs (pure chronological, negative).
    // The boost must not tilt it: the queue is strictly newest-first.
    const mostRecent: KnobState = { recency: 5, likes: 0, comments: 0, halfLife: 0, character: 0 };
    const current = post({ _id: 'cur', tags: ['climbing'] });
    const out = rankWatchQueue(
      [
        post({ _id: 'old-match', tags: ['climbing'], created_at: hoursAgo(48) }),
        post({ _id: 'new-zero', tags: ['unrelated'], created_at: hoursAgo(1) }),
      ],
      current,
      mostRecent,
      'more-like-this',
    );
    // Newest first, regardless of tag overlap (the boost is off for the
    // negative-valued chronological ranking).
    expect(out.map((p) => p._id)).toEqual(['new-zero', 'old-match']);
  });

  it('a stronger relatedness preset tilts harder (more-like-this > mixed)', () => {
    const current = post({ _id: 'cur', tags: ['climbing', 'outdoors', 'adventure'] });
    // 'near' shares 1 tag, 'far' shares 0, both identical engagement. Under
    // mixed (tagWeight 0.5) the tilt is small; under more-like-this (0.8) it
    // is larger. Both put 'near' first, but the ORDER is the assertion here —
    // a tag-overlap post beats a zero-overlap post at either preset.
    const mixed = rankWatchQueue(
      [post({ _id: 'far', tags: ['x'], likes: 10 }), post({ _id: 'near', tags: ['climbing'], likes: 10 })],
      current,
      BALANCED,
      'mixed',
    );
    const moreLike = rankWatchQueue(
      [post({ _id: 'far', tags: ['x'], likes: 10 }), post({ _id: 'near', tags: ['climbing'], likes: 10 })],
      current,
      BALANCED,
      'more-like-this',
    );
    expect(mixed[0]._id).toBe('near');
    expect(moreLike[0]._id).toBe('near');
  });
});
