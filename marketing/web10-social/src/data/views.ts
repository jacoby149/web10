import { getV3Client } from './v3';
import { getDiscoverGroupId } from './groups';

// ── Views / impressions (D86 — the content analytics engine) ─────────────────
// A view is the D86 engine's delivery metrics: **impressions** (total delivery
// events — how many times the post was served) + **reach** (distinct readers —
// how many people saw it). It is NOT a client-written counter — it is the
// server-side, un-gameable delivery impression the node records when it serves
// the post to a reader (the read path / query path logs a `delivery`
// content_event), and the on-surface metrics are a `contentViews` read over
// those events. The on-surface number and the creator dashboard are the SAME
// object — one source of truth, not two.
//
// There is NO client-side "record a view" write. The delivery IS the view, and
// it is logged server-side as a side effect of the read (the app passes
// `surface` on the read). A client-written view would be redundant (the node
// already recorded the delivery) and gameable (a user in devtools could fire it
// at will) — so it does not exist.
//
// NOTE (anon gap, planned): delivery is currently logged for verified readers
// only, so signed-out viewers don't yet count. Supporting anon (coarse IP
// dedupe) is a planned follow-up — see the D86 anon-delivery plan item.
//
// A view is NOT an engagement signal for ranking (it doesn't feed the power
// mean) — it's a reach metric shown to the author and the reader, the way
// Twitter/YouTube show "N views" under a post.

/** The on-surface view metrics for one post (D86). */
export interface PostViews {
  /** Total delivery events (the eye icon). */
  impressions: number;
  /** Distinct readers (the person icon). */
  reach: number;
}

const EMPTY_VIEWS: PostViews = { impressions: 0, reach: 0 };

/**
 * Read the view metrics (impressions + reach) for a set of posts (D86).
 * Returns a post_id → PostViews map; a post with no views is absent (the
 * caller treats absent as 0). The `contentViews` read — the engine's delivery
 * metrics, I3-scoped to the reader's readable groups (a post the reader can't
 * read returns no metrics).
 */
export async function readViewCounts(
  postIds: string[],
  groups?: string[],
): Promise<Record<string, PostViews>> {
  if (!postIds.length) return {};
  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  try {
    const counts = await w.contentViews({ service: 'posts', docIds: postIds, groups: targetGroups });
    return counts;
  } catch (e) {
    console.warn('[social:views] readViewCounts failed (degrading to {}):', e);
    return {};
  }
}

/**
 * Read the view metrics for a single post (the watch / short / lightbox detail
 * surfaces). Returns EMPTY_VIEWS on absence or failure.
 */
export async function readViewCount(postId: string, groups?: string[]): Promise<PostViews> {
  if (!postId) return EMPTY_VIEWS;
  const counts = await readViewCounts([postId], groups);
  return counts[postId] ?? EMPTY_VIEWS;
}

// ── Viewport / dwell signals (D86 — the client-gated tier) ───────────────────
// The delivery (above) is the server-side floor: the node counts a doc the
// moment it serves it. The **viewport** tier is the client's "how long did the
// reader actually look" — inherently client-side knowledge (the server has no
// idea which of the 50 docs a reader stared at). The app fires it from its own
// UI (an IntersectionObserver for a feed card, a video `timeupdate` for a
// short); the node **gates** it on a preceding delivery (a reader cannot report
// on a doc the node never served them) + dedupes per (doc, reader, surface,
// type) per window. Fire-and-forget: a failure never blocks the surface.

/**
 * Report a `viewport` dwell signal for a post (D86). `dwellMs` is how long the
 * post was in the reader's viewport; `visiblePct` the fraction of the
 * observation window it was visible (0..1). Fire-and-forget — the node gates it
 * on a preceding delivery + dedupes, so a no-op (within the window / never
 * served) is fine.
 */
export function trackPostViewport(
  postId: string,
  surface: string,
  dwellMs: number,
  visiblePct?: number,
): void {
  if (!postId || dwellMs <= 0) return;
  const w = getV3Client();
  const payload: Record<string, unknown> = { dwell_ms: Math.round(dwellMs) };
  if (visiblePct != null) payload.visible_pct = Math.round(visiblePct * 100) / 100;
  const p = w.trackContentEvent(postId, {
    service: 'posts',
    surface,
    type: 'viewport',
    payload: JSON.stringify(payload),
  });
  if (p && typeof (p as Promise<unknown>).catch === 'function') {
    (p as Promise<unknown>).catch((e) => {
      console.warn('[social:views] trackPostViewport failed (non-fatal):', e);
    });
  }
}

/**
 * Report a `viewport` watch signal for a video post (D86). `watchedMs` is how
 * much of the video the reader watched; `durationMs` the video's total length
 * (so the dashboard can compute watch %). Fire-and-forget, same gate + dedupe.
 */
export function trackVideoViewport(
  postId: string,
  surface: string,
  watchedMs: number,
  durationMs?: number,
): void {
  if (!postId || watchedMs <= 0) return;
  const w = getV3Client();
  const payload: Record<string, unknown> = { watched_ms: Math.round(watchedMs) };
  if (durationMs && durationMs > 0) payload.duration_ms = Math.round(durationMs);
  const p = w.trackContentEvent(postId, {
    service: 'posts',
    surface,
    type: 'viewport',
    payload: JSON.stringify(payload),
  });
  if (p && typeof (p as Promise<unknown>).catch === 'function') {
    (p as Promise<unknown>).catch((e) => {
      console.warn('[social:views] trackVideoViewport failed (non-fatal):', e);
    });
  }
}
