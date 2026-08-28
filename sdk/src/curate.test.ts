import { describe, it, expect } from 'vitest'
import { curateAds, type CuratableAd } from './curate'

// ── Helpers ────────────────────────────────────────────────────────────────

function ad(doc_id: string, status?: string): CuratableAd {
  return status === undefined ? { doc_id } : { doc_id, body: { status } }
}

// ── Active filter ──────────────────────────────────────────────────────────

describe('curateAds — active filter', () => {
  it('drops paused ads', () => {
    const out = curateAds([ad('a', 'active'), ad('b', 'paused'), ad('c', 'active')], {
      dissemination: 'round_robin',
    })
    expect(out.map((a) => a.doc_id)).toEqual(['a', 'c'])
  })

  it('treats a missing status as active (default)', () => {
    const out = curateAds([ad('a'), ad('b', 'paused')], { dissemination: 'round_robin' })
    expect(out.map((a) => a.doc_id)).toEqual(['a'])
  })

  it('returns empty when every ad is paused', () => {
    const out = curateAds([ad('a', 'paused'), ad('b', 'paused')], { dissemination: 'round_robin' })
    expect(out).toEqual([])
  })

  it('returns empty for no ads', () => {
    expect(curateAds([], { dissemination: 'round_robin' })).toEqual([])
  })
})

// ── round_robin ────────────────────────────────────────────────────────────

describe('curateAds — round_robin', () => {
  it('returns all active ads in canonical order with no prior state', () => {
    // input order is scrambled; canonical (doc_id) order wins
    const out = curateAds([ad('c'), ad('a'), ad('b')], { dissemination: 'round_robin' })
    expect(out.map((a) => a.doc_id)).toEqual(['a', 'b', 'c'])
  })

  it('rotates so the ad after lastShown comes first', () => {
    const out = curateAds([ad('a'), ad('b'), ad('c')], { dissemination: 'round_robin' }, {
      lastShownDocId: 'a',
    })
    expect(out.map((a) => a.doc_id)).toEqual(['b', 'c', 'a'])
  })

  it('wraps around when the last ad was shown', () => {
    const out = curateAds([ad('a'), ad('b'), ad('c')], { dissemination: 'round_robin' }, {
      lastShownDocId: 'c',
    })
    expect(out.map((a) => a.doc_id)).toEqual(['a', 'b', 'c'])
  })

  it('ignores a lastShownDocId that is not in the active set', () => {
    const out = curateAds([ad('a'), ad('b')], { dissemination: 'round_robin' }, {
      lastShownDocId: 'zzz',
    })
    expect(out.map((a) => a.doc_id)).toEqual(['a', 'b'])
  })
})

// ── greedy ─────────────────────────────────────────────────────────────────

describe('curateAds — greedy', () => {
  it('orders by performance (highest first) when performance is supplied', () => {
    const out = curateAds([ad('a'), ad('b'), ad('c')], { dissemination: 'greedy' }, {
      performance: { a: 1, b: 9, c: 5 },
    })
    expect(out.map((a) => a.doc_id)).toEqual(['b', 'c', 'a'])
  })

  it('tie-breaks deterministically by doc_id', () => {
    const out = curateAds([ad('c'), ad('a'), ad('b')], { dissemination: 'greedy' }, {
      performance: { a: 5, b: 5, c: 5 },
    })
    expect(out.map((a) => a.doc_id)).toEqual(['a', 'b', 'c'])
  })

  it('treats a missing performance score as 0', () => {
    const out = curateAds([ad('a'), ad('b'), ad('c')], { dissemination: 'greedy' }, {
      performance: { b: 3 },
    })
    // b (3) first; a and c are 0 → doc_id order
    expect(out.map((a) => a.doc_id)).toEqual(['b', 'a', 'c'])
  })

  it('degrades to round_robin when no performance is supplied (v0 — no stats)', () => {
    const out = curateAds([ad('a'), ad('b'), ad('c')], { dissemination: 'greedy' }, {
      lastShownDocId: 'a',
    })
    // same as round_robin with lastShown 'a'
    expect(out.map((a) => a.doc_id)).toEqual(['b', 'c', 'a'])
  })

  it('degrades to canonical order when no performance and no lastShown', () => {
    const out = curateAds([ad('c'), ad('a'), ad('b')], { dissemination: 'greedy' })
    expect(out.map((a) => a.doc_id)).toEqual(['a', 'b', 'c'])
  })
})

// ── pinned ─────────────────────────────────────────────────────────────────

describe('curateAds — pinned', () => {
  it('returns only the pinned ad', () => {
    const out = curateAds([ad('a'), ad('b'), ad('c')], {
      dissemination: 'pinned',
      pinnedDocId: 'b',
    })
    expect(out.map((a) => a.doc_id)).toEqual(['b'])
  })

  it('returns empty when the pinned ad is paused', () => {
    const out = curateAds([ad('a'), ad('b', 'paused')], { dissemination: 'pinned', pinnedDocId: 'b' })
    expect(out).toEqual([])
  })

  it('returns empty when no pinnedDocId is set', () => {
    const out = curateAds([ad('a'), ad('b')], { dissemination: 'pinned' })
    expect(out).toEqual([])
  })

  it('returns empty when the pinned ad is not in the set', () => {
    const out = curateAds([ad('a'), ad('b')], { dissemination: 'pinned', pinnedDocId: 'zzz' })
    expect(out).toEqual([])
  })
})

// ── frequency_capped ───────────────────────────────────────────────────────

describe('curateAds — frequency_capped', () => {
  it('drops ads already shown cap times this session', () => {
    const out = curateAds([ad('a'), ad('b'), ad('c')], { dissemination: 'frequency_capped', cap: 2 }, {
      shownCounts: { a: 2, b: 1 },
    })
    // a hit the cap (2); b (1) and c (0) remain
    expect(out.map((a) => a.doc_id)).toEqual(['b', 'c'])
  })

  it('keeps every active ad when no cap is set', () => {
    const out = curateAds([ad('a'), ad('b')], { dissemination: 'frequency_capped' }, {
      shownCounts: { a: 99 },
    })
    expect(out.map((a) => a.doc_id)).toEqual(['a', 'b'])
  })

  it('still drops paused ads', () => {
    const out = curateAds([ad('a'), ad('b', 'paused')], { dissemination: 'frequency_capped', cap: 5 })
    expect(out.map((a) => a.doc_id)).toEqual(['a'])
  })
})

// ── Determinism ────────────────────────────────────────────────────────────

describe('curateAds — determinism', () => {
  it('returns the same output for the same inputs', () => {
    const ads = [ad('a'), ad('b'), ad('c')]
    const setting = { dissemination: 'round_robin' as const }
    const state = { lastShownDocId: 'b' }
    expect(curateAds(ads, setting, state).map((a) => a.doc_id)).toEqual(
      curateAds(ads, setting, state).map((a) => a.doc_id),
    )
  })

  it('is independent of the order the ads arrive in', () => {
    const setting = { dissemination: 'round_robin' as const }
    const state = { lastShownDocId: 'a' }
    const forward = curateAds([ad('a'), ad('b'), ad('c')], setting, state).map((a) => a.doc_id)
    const backward = curateAds([ad('c'), ad('b'), ad('a')], setting, state).map((a) => a.doc_id)
    expect(forward).toEqual(backward)
  })
})
