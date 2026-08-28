/**
 * curateAds — the shared, deterministic D51 curation helper.
 *
 * How a creator's ads get mixed into a viewer's feed is a per-creator choice
 * (D51), not a platform decision. The curation is a pure function, not SQL:
 * the stateful algorithms (round-robin needs "which ad showed last," greedy
 * needs performance numbers) do not belong in a query. Because the helper is
 * shared and deterministic, every app curates a given creator's ads
 * identically from the same inputs.
 *
 * KB: knowledge/knowledge-base/web10-v3/social/ads.md (the Dissemination
 * section) + ads-catalog.md.
 */

/** The D51 dissemination modes — a per-creator choice on the `settings` doc. */
export type DisseminationMode = 'round_robin' | 'greedy' | 'pinned' | 'frequency_capped'

/** The creator's ad-dissemination setting (normalized from the `settings` doc). */
export interface AdDisseminationSetting {
  dissemination: DisseminationMode
  /** `frequency_capped`: max times the same ad shows per session. */
  cap?: number
  /** `pinned`: the doc_id of the ad that is live. */
  pinnedDocId?: string
}

/**
 * App-local curation state (memory / localStorage) — the stateful
 * algorithms' memory. Passed in so the helper stays a pure function.
 */
export interface CurationState {
  /** `round_robin` (and the `greedy` fallback): the doc_id shown last. */
  lastShownDocId?: string
  /** `frequency_capped`: how many times each ad has shown this session. */
  shownCounts?: Record<string, number>
  /**
   * `greedy`: per-ad performance score (doc_id → number). v0 supplies none —
   * the ad object carries no `stats` (D55) — so `greedy` degrades to
   * `round_robin` until the v4 metrics layer feeds this in.
   */
  performance?: Record<string, number>
}

/** An ad post as the feed read returns it. Only `doc_id` + `body.status` are needed. */
export interface CuratableAd {
  doc_id: string
  body?: Record<string, unknown>
}

/**
 * Given a creator's ad posts + their dissemination setting + app-local state,
 * return the ordered subset of ACTIVE ads to show. The caller takes what it
 * needs — the first entry for a single post (the composer's "Rotate my ads"),
 * or the whole list for a curated-subset surface.
 *
 * Filters on `body.status`: an ad is showable unless it is `paused` (status
 * defaults to `active`, per the locked ad object).
 *
 * Modes:
 * - `round_robin` — rotate the active ads (start after `lastShownDocId`) so
 *   each gets equal exposure.
 * - `greedy` — order by `performance` (highest first). v0 has no performance
 *   metrics, so with no `performance` supplied it degrades to `round_robin`.
 * - `pinned` — return just the pinned ad (if active).
 * - `frequency_capped` — drop ads already shown `cap`× this session.
 *
 * Deterministic: the result depends only on the inputs. The active set is
 * canonically ordered by `doc_id` first, so the output is independent of the
 * order the ads happened to arrive in.
 */
export function curateAds<T extends CuratableAd>(
  creatorAds: T[],
  setting: AdDisseminationSetting,
  state: CurationState = {},
): T[] {
  // 1. Active only — status defaults to active; only an explicit 'paused' hides.
  const active = creatorAds.filter((ad) => (ad.body?.status ?? 'active') !== 'paused')
  if (active.length === 0) return []

  // Canonical order (doc_id) so the result is independent of input order.
  const canonical = [...active].sort((a, b) => compareDocIds(a.doc_id, b.doc_id))

  switch (setting.dissemination) {
    case 'pinned': {
      const pinned = canonical.find((ad) => ad.doc_id === setting.pinnedDocId)
      return pinned ? [pinned] : []
    }
    case 'frequency_capped': {
      const cap = setting.cap ?? Number.POSITIVE_INFINITY
      const counts = state.shownCounts ?? {}
      return canonical.filter((ad) => (counts[ad.doc_id] ?? 0) < cap)
    }
    case 'greedy': {
      const perf = state.performance
      const hasPerf = perf !== undefined && Object.keys(perf).length > 0
      if (!hasPerf) {
        // v0: no performance metrics (D55 — no stats in the ad object) →
        // degrade to round_robin so no ad is starved. True greedy the moment
        // the v4 metrics layer feeds `performance` in.
        return rotate(canonical, state.lastShownDocId)
      }
      return [...canonical].sort((a, b) => {
        const pa = perf[a.doc_id] ?? 0
        const pb = perf[b.doc_id] ?? 0
        if (pb !== pa) return pb - pa // higher performance first
        return compareDocIds(a.doc_id, b.doc_id) // deterministic tie-break
      })
    }
    case 'round_robin':
    default:
      return rotate(canonical, state.lastShownDocId)
  }
}

/** Rotate `list` so the entry after `lastShownDocId` comes first (wrap-around). */
function rotate<T extends CuratableAd>(list: T[], lastShownDocId?: string): T[] {
  if (!lastShownDocId || list.length === 0) return list
  const idx = list.findIndex((ad) => ad.doc_id === lastShownDocId)
  if (idx === -1) return list
  return list.slice(idx + 1).concat(list.slice(0, idx + 1))
}

function compareDocIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
