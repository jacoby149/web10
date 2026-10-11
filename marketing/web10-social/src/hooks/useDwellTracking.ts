import { useEffect, type RefObject } from 'react';
import { trackPostViewport } from '@/data/views';

// ── Dwell tracking (D86 — the client-gated viewport tier) ────────────────────
// The node counts a **delivery** the moment it serves a doc (the un-gameable
// floor). This hook adds the **viewport** tier: how long the reader actually
// had the doc in view. It is inherently client-side knowledge (the server has
// no idea which of the 50 docs a reader lingered on), so the app reports it.
// The node GATES it on a preceding delivery (a reader can't report on a doc the
// node never served) + dedupes per (doc, reader, surface) per window — so a
// fire-and-forget here is safe: over-reporting is a server-side no-op.
//
// The hook observes the card element, accumulates the time it spends visible
// (intersectionRatio >= 0.5), and fires ONE viewport signal when the card
// leaves the viewport or the component unmounts — carrying the accumulated
// dwell + the peak visibility fraction. It never fires for a sub-500ms flash
// (a scroll-past), so "scrolled by it" doesn't read as "looked at it."

/** A card is "visible" at or above this fraction of its area. */
const VISIBLE_THRESHOLD = 0.5;
/** Ignore dwells shorter than this (a scroll-past, not a read). */
const MIN_DWELL_MS = 500;

/**
 * Track how long `targetRef`'s element is in the reader's viewport and report
 * the dwell to the D86 engine each time the card LEAVES the viewport (and on
 * unmount). Pass `postId` + `surface` (the D86 surface label — the same one the
 * read passed, e.g. `feed` / `discover` / `shorts` / `profile` / `group`).
 * Pass `postId` as `''`/`undefined` or `surface` as `''` to disable (an ad
 * tile, or before the post id resolves).
 *
 * Each visible→hidden transition is one "I looked at this for Xms" event. The
 * node GATES it on a preceding delivery + dedupes per (doc, reader, surface,
 * type) per window — so a re-visit within the window is a server-side no-op
 * (the first visit's dwell is what counts), and over-reporting is safe.
 */
export function useDwellTracking(
  targetRef: RefObject<HTMLElement | null>,
  postId: string | undefined,
  surface: string,
): void {
  useEffect(() => {
    const el = targetRef.current;
    if (!el || !postId || !surface) return;

    let dwellMs = 0;
    let peakRatio = 0;
    let lastVisibleAt = 0;

    // Settle any in-progress visible span, then report if it clears the floor.
    // Resets the accumulator so a re-visit starts fresh (the server dedupes
    // within the window regardless — the first visit's dwell is what counts).
    const flush = () => {
      if (lastVisibleAt) {
        dwellMs += Date.now() - lastVisibleAt;
        lastVisibleAt = 0;
      }
      if (dwellMs < MIN_DWELL_MS) return;
      trackPostViewport(postId, surface, dwellMs, peakRatio);
      dwellMs = 0;
      peakRatio = 0;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const now = Date.now();
          if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_THRESHOLD) {
            if (!lastVisibleAt) lastVisibleAt = now;
            peakRatio = Math.max(peakRatio, entry.intersectionRatio);
          } else if (lastVisibleAt) {
            // The card left the viewport — report the dwell for this visit.
            dwellMs += now - lastVisibleAt;
            lastVisibleAt = 0;
            flush();
          }
        }
      },
      { threshold: [0, VISIBLE_THRESHOLD, 1] },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      flush(); // the card leaves with the screen
    };
  }, [targetRef, postId, surface]);
}
