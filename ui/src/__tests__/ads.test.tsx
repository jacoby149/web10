import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import {
  followersGroupId,
  splitCatalog,
  parseAd,
  buildOfferBody,
} from '../components/Studio/ads-data'
import { AdsCard } from '../components/Studio/AdsCard'

// ── ads-data helpers ──

describe('followersGroupId', () => {
  it('derives the node-minted followers group ID', () => {
    expect(followersGroupId({ provider: 'api.localhost', username: 'alice' }))
      .toBe('api.localhost/groups/users/alice/followers')
  })

  it('falls back to a default provider', () => {
    expect(followersGroupId({ username: 'alice' })).toBe('api.localhost/groups/users/alice/followers')
    expect(followersGroupId(null)).toBe('api.localhost/groups/users//followers')
  })
})

function adDoc(over: Record<string, unknown> = {}) {
  return {
    doc_id: 'ad-1',
    author_key: 'alice',
    collection_name: 'posts',
    body: {
      text: 'Everything I use, linked.',
      tags: ['ad'],
      offer: {
        kind: { type: 'text', value: 'affiliate' },
        partner: { type: 'text', value: 'Amazon' },
        link: { type: 'text', value: 'https://amzn.to/abc' },
        cta: { type: 'text', value: 'Get it' },
        disclosure: { type: 'text', value: 'I may earn a commission.' },
      },
      status: 'active',
    },
    tags: ['ad'],
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...over,
  }
}

function albumDoc(id = 'album-1', name = 'Summer 2026') {
  return {
    doc_id: id,
    author_key: 'alice',
    collection_name: 'posts',
    body: { name, tags: ['ad_album'] },
    tags: ['ad_album'],
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  }
}

function postDoc(id = 'post-1', text = 'a post', adTarget = '') {
  return {
    doc_id: id,
    author_key: 'alice',
    collection_name: 'posts',
    body: { text, tags: [] },
    tags: [],
    ad_mode: adTarget ? 'pinned' : 'none',
    ad_target: adTarget,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  }
}

describe('parseAd', () => {
  it('parses the offer leaves + status + album tags', () => {
    const ad = parseAd(adDoc({ tags: ['ad', 'album:album-1', 'album:album-2'] }) as any)
    expect(ad.text).toBe('Everything I use, linked.')
    expect(ad.offer.kind).toBe('affiliate')
    expect(ad.offer.partner).toBe('Amazon')
    expect(ad.offer.link).toBe('https://amzn.to/abc')
    expect(ad.status).toBe('active')
    expect(ad.albums).toEqual(['album-1', 'album-2'])
  })

  it('treats a missing status as active', () => {
    const ad = parseAd(adDoc({ body: { text: 'x', tags: ['ad'] } }) as any)
    expect(ad.status).toBe('active')
  })

  it('honors a paused status', () => {
    const ad = parseAd(adDoc({ body: { text: 'x', tags: ['ad'], status: 'paused' } }) as any)
    expect(ad.status).toBe('paused')
  })
})

describe('splitCatalog', () => {
  it('splits a feed read into ads / albums / posts', () => {
    const data = splitCatalog([
      adDoc(),
      adDoc({ doc_id: 'ad-2' }),
      albumDoc(),
      postDoc(),
      postDoc('post-2', 'another', 'ad-1'),
    ] as any[])
    expect(data.ads.map(a => a.doc.doc_id)).toEqual(['ad-1', 'ad-2'])
    expect(data.albums.map(a => a.doc.doc_id)).toEqual(['album-1'])
    expect(data.posts.map(p => p.doc.doc_id)).toEqual(['post-1', 'post-2'])
    expect(data.posts[1].pinnedAdTarget).toBe('ad-1')
  })

  it('computes per-album ad counts', () => {
    const data = splitCatalog([
      adDoc({ tags: ['ad', 'album:album-1'] }),
      adDoc({ doc_id: 'ad-2', tags: ['ad', 'album:album-1', 'album:album-2'] }),
      albumDoc('album-1'),
      albumDoc('album-2'),
    ] as any[])
    const byId = Object.fromEntries(data.albums.map(a => [a.doc.doc_id, a.adCount]))
    expect(byId['album-1']).toBe(2)
    expect(byId['album-2']).toBe(1)
  })
})

describe('buildOfferBody', () => {
  it('builds a leaf-typed offer body with the ad tag + album tags', () => {
    const body = buildOfferBody(
      { kind: 'affiliate', partner: 'Amazon', link: 'https://x', cta: 'Get it', disclosure: 'disc' },
      'copy',
      'active',
      ['album-1'],
    )
    expect(body.tags).toEqual(['ad', 'album:album-1'])
    expect(body.status).toBe('active')
    const offer = body.offer as Record<string, { type: string; value: string }>
    expect(offer.kind).toEqual({ type: 'text', value: 'affiliate' })
    expect(offer.link).toEqual({ type: 'text', value: 'https://x' })
  })
})

// ── AdsCard component ──

function mockV3(readResult: unknown[] = [], readError?: Error) {
  return {
    readToken: () => ({ provider: 'api.localhost', username: 'alice' }),
    read: vi.fn().mockImplementation(() => (readError ? Promise.reject(readError) : Promise.resolve(readResult))),
    create: vi.fn().mockResolvedValue({ doc_id: 'new-1' }),
    update: vi.fn().mockResolvedValue({ doc_id: 'x' }),
    delete: vi.fn().mockResolvedValue({ doc_id: 'x', status: 'deleted' }),
    getGroup: vi.fn().mockResolvedValue({ group_id: 'g' }),
    createGroup: vi.fn().mockResolvedValue({ group_id: 'g' }),
  }
}

function renderCard(v3: ReturnType<typeof mockV3>) {
  const I = { isMock: true, setStatus: vi.fn(), v3 }
  const onStatus = vi.fn()
  const utils = render(<AdsCard I={I} onStatus={onStatus} />)
  return { I, onStatus, ...utils }
}

describe('AdsCard', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows the empty state when there are no ads or albums', async () => {
    renderCard(mockV3([]))
    expect(await screen.findByTestId('ads-empty')).toBeTruthy()
    expect(screen.getByTestId('ads-empty-cta')).toBeTruthy()
  })

  it('treats a 403 (no followers group yet) as the empty state, not an error', async () => {
    renderCard(mockV3([], new Error('v3 read failed: 403 not a member')))
    expect(await screen.findByTestId('ads-empty')).toBeTruthy()
  })

  it('shows an error state + retry on a real failure', async () => {
    renderCard(mockV3([], new Error('v3 read failed: 500 boom')))
    expect(await screen.findByTestId('ads-error')).toBeTruthy()
    expect(screen.getByTestId('ads-retry')).toBeTruthy()
  })

  it('renders the catalog with status + offer for each ad', async () => {
    renderCard(mockV3([adDoc(), adDoc({ doc_id: 'ad-2', body: { text: 'Paused one', tags: ['ad'], status: 'paused' } })] as any[]))
    expect(await screen.findByTestId('ads-row-ad-1')).toBeTruthy()
    expect(screen.getByTestId('ads-row-ad-2')).toBeTruthy()
    expect(screen.getByText('Everything I use, linked.')).toBeTruthy()
    expect(screen.getByText(/Amazon/)).toBeTruthy()
  })

  it('pauses an active ad (update with status)', async () => {
    const v3 = mockV3([adDoc()])
    renderCard(v3)
    await screen.findByTestId('ads-row-ad-1')
    fireEvent.click(screen.getByTestId('ads-pause-ad-1'))
    await waitFor(() => expect(v3.update).toHaveBeenCalledWith('ad-1', { status: 'paused' }))
  })

  it('retires an ad (delete)', async () => {
    const v3 = mockV3([adDoc()])
    renderCard(v3)
    await screen.findByTestId('ads-row-ad-1')
    fireEvent.click(screen.getByTestId('ads-retire-ad-1'))
    await waitFor(() => expect(v3.delete).toHaveBeenCalledWith('ad-1'))
  })

  it('opens the new-ad dialog and creates an ad (create with the offer body + followers group)', async () => {
    const v3 = mockV3([])
    renderCard(v3)
    await screen.findByTestId('ads-empty')
    fireEvent.click(screen.getByTestId('ads-new-ad'))
    const link = await screen.findByTestId('ad-link')
    fireEvent.change(link, { target: { value: 'https://amzn.to/abc' } })
    fireEvent.change(screen.getByTestId('ad-text'), { target: { value: 'My ad' } })
    fireEvent.click(screen.getByTestId('ad-save'))
    await waitFor(() => expect(v3.create).toHaveBeenCalled())
    const [collection, body, opts] = (v3.create as any).mock.calls[0]
    expect(collection).toBe('posts')
    expect(body.tags).toContain('ad')
    expect(body.offer.link).toEqual({ type: 'text', value: 'https://amzn.to/abc' })
    expect(opts.groups).toEqual(['api.localhost/groups/users/alice/followers'])
  })

  it('disables the create button until a link is provided', async () => {
    renderCard(mockV3([]))
    await screen.findByTestId('ads-empty')
    fireEvent.click(screen.getByTestId('ads-new-ad'))
    const save = await screen.findByTestId('ad-save')
    expect((save as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates an album', async () => {
    // seed an ad so the albums section renders (it only shows with data)
    const v3 = mockV3([adDoc()] as any[])
    renderCard(v3)
    await screen.findByTestId('ads-row-ad-1')
    fireEvent.click(screen.getByTestId('ads-new-album'))
    fireEvent.change(await screen.findByTestId('album-name'), { target: { value: 'Summer 2026' } })
    fireEvent.click(screen.getByTestId('album-save'))
    await waitFor(() => expect(v3.create).toHaveBeenCalled())
    const [collection, body, opts] = (v3.create as any).mock.calls[0]
    expect(collection).toBe('posts')
    expect(body.tags).toContain('ad_album')
    expect(opts.groups).toEqual(['api.localhost/groups/users/alice/followers'])
  })

  it('pins an ad to a post (update with ad_preference)', async () => {
    const v3 = mockV3([adDoc(), postDoc('post-1', 'my post')] as any[])
    renderCard(v3)
    await screen.findByTestId('ads-row-ad-1')
    fireEvent.click(screen.getByTestId('ads-pin-ad-1'))
    const postOption = await screen.findByTestId('ads-pin-post-post-1')
    fireEvent.click(postOption)
    fireEvent.click(screen.getByTestId('ads-pin-confirm'))
    await waitFor(() => expect(v3.update).toHaveBeenCalledWith(
      'post-1',
      {},
      { ad_preference: { mode: 'pinned', target: 'ad-1' } },
    ))
  })

  it('shows a no-posts message in the pin dialog when there are no posts', async () => {
    const v3 = mockV3([adDoc()] as any[])
    renderCard(v3)
    await screen.findByTestId('ads-row-ad-1')
    fireEvent.click(screen.getByTestId('ads-pin-ad-1'))
    expect(await screen.findByText(/no posts to pin to yet/i)).toBeTruthy()
  })

  it('filters the catalog by album (sort by album or all)', async () => {
    // two ads: one in album-1, one in both album-1 and album-2
    const v3 = mockV3([
      adDoc({ doc_id: 'ad-1', tags: ['ad', 'album:album-1'] }),
      adDoc({ doc_id: 'ad-2', tags: ['ad', 'album:album-1', 'album:album-2'] }),
      albumDoc('album-1', 'Summer'),
      albumDoc('album-2', 'Fall'),
    ] as any[])
    renderCard(v3)
    await screen.findByTestId('ads-row-ad-1')
    // both ads visible under "All"
    expect(screen.getByTestId('ads-row-ad-1')).toBeTruthy()
    expect(screen.getByTestId('ads-row-ad-2')).toBeTruthy()
    // filter to album-2 → only ad-2
    fireEvent.click(screen.getByTestId('ads-filter-fall'))
    expect(screen.queryByTestId('ads-row-ad-1')).toBeNull()
    expect(screen.getByTestId('ads-row-ad-2')).toBeTruthy()
    // back to All → both
    fireEvent.click(screen.getByTestId('ads-filter-all'))
    expect(screen.getByTestId('ads-row-ad-1')).toBeTruthy()
    expect(screen.getByTestId('ads-row-ad-2')).toBeTruthy()
  })
})