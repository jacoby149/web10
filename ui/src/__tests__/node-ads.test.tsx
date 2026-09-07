import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import {
  discoverGroupId,
  isNodeAd,
  splitNodeAds,
  buildNodeAdBody,
} from '../components/Studio/ads-data'
import { AdInventoryCard } from '../components/Studio/AdInventoryCard'

// ── node-ads data helpers ──

describe('discoverGroupId', () => {
  it('derives the node-default discover group ID', () => {
    expect(discoverGroupId('api.localhost')).toBe('api.localhost/groups/web10/discover')
  })

  it('falls back to a default provider', () => {
    expect(discoverGroupId(null)).toBe('api.localhost/groups/web10/discover')
    expect(discoverGroupId(undefined)).toBe('api.localhost/groups/web10/discover')
  })
})

function nodeAdDoc(over: Record<string, unknown> = {}) {
  return {
    doc_id: 'node-ad-1',
    author_key: 'nodeops',
    collection_name: 'posts',
    body: {
      text: 'Try the new workflow tool.',
      tags: ['ad', 'node_ad'],
      offer: {
        kind: { type: 'text', value: 'direct' },
        partner: { type: 'text', value: 'WorkflowCo' },
        link: { type: 'text', value: 'https://workflowco.com?ref=node' },
        cta: { type: 'text', value: 'Learn more' },
        disclosure: { type: 'text', value: 'Sponsored' },
      },
      status: 'active',
    },
    tags: ['ad', 'node_ad'],
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...over,
  }
}

function creatorAdDoc(over: Record<string, unknown> = {}) {
  return {
    doc_id: 'creator-ad-1',
    author_key: 'alice',
    collection_name: 'posts',
    body: { text: 'my ad', tags: ['ad'], status: 'active' },
    tags: ['ad'],
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...over,
  }
}

function plainPostDoc(over: Record<string, unknown> = {}) {
  return {
    doc_id: 'post-1',
    author_key: 'alice',
    collection_name: 'posts',
    body: { text: 'a post', tags: [] },
    tags: [],
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...over,
  }
}

describe('isNodeAd', () => {
  it('true only for a doc tagged ad + node_ad', () => {
    expect(isNodeAd(nodeAdDoc() as any)).toBe(true)
    expect(isNodeAd(creatorAdDoc() as any)).toBe(false)
    expect(isNodeAd(plainPostDoc() as any)).toBe(false)
  })
})

describe('splitNodeAds', () => {
  it('filters a discover-group read down to the node ads', () => {
    const ads = splitNodeAds([
      nodeAdDoc(),
      creatorAdDoc(),
      plainPostDoc(),
      nodeAdDoc({ doc_id: 'node-ad-2' }),
    ] as any[])
    expect(ads.map(a => a.doc.doc_id)).toEqual(['node-ad-1', 'node-ad-2'])
  })
})

describe('buildNodeAdBody', () => {
  it('builds a leaf-typed offer body with the ad + node_ad tags', () => {
    const body = buildNodeAdBody(
      { kind: 'direct', partner: 'WorkflowCo', link: 'https://x', cta: 'Learn more', disclosure: 'Sponsored' },
      'copy',
      'active',
    )
    expect(body.tags).toEqual(['ad', 'node_ad'])
    expect(body.status).toBe('active')
    const offer = body.offer as Record<string, { type: string; value: string }>
    expect(offer.kind).toEqual({ type: 'text', value: 'direct' })
    expect(offer.link).toEqual({ type: 'text', value: 'https://x' })
  })
})

// ── AdInventoryCard component ──

vi.mock('axios')
import axios from 'axios'
const mockAxiosPost = axios.post as unknown as ReturnType<typeof vi.fn>

function mockV3(readResult: unknown[] = [], readError?: Error) {
  return {
    readToken: () => ({ provider: 'api.localhost', username: 'nodeops' }),
    state: { token: 'tok' },
    read: vi.fn().mockImplementation(() => (readError ? Promise.reject(readError) : Promise.resolve(readResult))),
    create: vi.fn().mockResolvedValue({ doc_id: 'new-node-ad' }),
    update: vi.fn().mockResolvedValue({ doc_id: 'x' }),
    delete: vi.fn().mockResolvedValue({ doc_id: 'x', status: 'deleted' }),
  }
}

function renderCard(v3: ReturnType<typeof mockV3>, configPct = 10) {
  mockAxiosPost.mockImplementation((path: string) =>
    Promise.resolve({ data: path.endsWith('/config') && !path.endsWith('/config/update') ? { node_ad_percentage: configPct } : {} }),
  )
  const I = { isMock: true, setStatus: vi.fn(), v3 }
  const onStatus = vi.fn()
  const utils = render(<AdInventoryCard I={I} onStatus={onStatus} />)
  return { I, onStatus, ...utils }
}

describe('AdInventoryCard', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows the empty state when there are no node ads', async () => {
    renderCard(mockV3([]))
    expect(await screen.findByTestId('node-ads-empty')).toBeTruthy()
    expect(screen.getByTestId('node-ads-empty-cta')).toBeTruthy()
  })

  it('shows an error state + retry on a read failure', async () => {
    renderCard(mockV3([], new Error('v3 read failed: 500 boom')))
    expect(await screen.findByTestId('node-ads-error')).toBeTruthy()
    expect(screen.getByTestId('node-ads-retry')).toBeTruthy()
  })

  it('renders the density slider with the loaded percentage', async () => {
    renderCard(mockV3([]), 25)
    expect(await screen.findByTestId('node-ads-pct-slider')).toBeTruthy()
    // The config load is async — wait for the percentage to resolve from 10 → 25.
    await waitFor(() => expect(screen.getByTestId('node-ads-pct-value')).toHaveTextContent('25%'))
    expect(screen.getByTestId('node-ads-pct-status')).toHaveTextContent('saved')
  })

  it('saves the percentage on slider release (config/update)', async () => {
    const v3 = mockV3([])
    renderCard(v3, 10)
    const slider = await screen.findByTestId('node-ads-pct-slider')
    fireEvent.change(slider, { target: { value: '30' } })
    fireEvent.pointerUp(slider)
    await waitFor(() => expect(mockAxiosPost).toHaveBeenCalledWith(
      'http://api.localhost/config/update',
      { token: { token: 'tok' }, update: { node_ad_percentage: 30 } },
      expect.objectContaining({ headers: expect.anything() }),
    ))
  })

  it('shows the inventory with status + offer for each node ad', async () => {
    renderCard(mockV3([
      nodeAdDoc(),
      nodeAdDoc({ doc_id: 'node-ad-2', body: { text: 'Paused one', tags: ['ad', 'node_ad'], status: 'paused' } }),
    ] as any[]))
    expect(await screen.findByTestId('node-ads-row-node-ad-1')).toBeTruthy()
    expect(screen.getByTestId('node-ads-row-node-ad-2')).toBeTruthy()
    expect(screen.getByText('Try the new workflow tool.')).toBeTruthy()
    expect(screen.getByText(/WorkflowCo/)).toBeTruthy()
  })

  it('pauses an active node ad (update with status)', async () => {
    const v3 = mockV3([nodeAdDoc()] as any[])
    renderCard(v3)
    await screen.findByTestId('node-ads-row-node-ad-1')
    fireEvent.click(screen.getByTestId('node-ads-pause-node-ad-1'))
    await waitFor(() => expect(v3.update).toHaveBeenCalledWith('node-ad-1', { status: 'paused' }))
  })

  it('retires a node ad (delete)', async () => {
    const v3 = mockV3([nodeAdDoc()] as any[])
    renderCard(v3)
    await screen.findByTestId('node-ads-row-node-ad-1')
    fireEvent.click(screen.getByTestId('node-ads-retire-node-ad-1'))
    await waitFor(() => expect(v3.delete).toHaveBeenCalledWith('node-ad-1'))
  })

  it('creates a node ad (create with the node_ad tag + discover group)', async () => {
    const v3 = mockV3([])
    renderCard(v3)
    await screen.findByTestId('node-ads-empty')
    fireEvent.click(screen.getByTestId('node-ads-new'))
    const link = await screen.findByTestId('node-ad-link')
    fireEvent.change(link, { target: { value: 'https://workflowco.com?ref=node' } })
    fireEvent.change(screen.getByTestId('node-ad-text'), { target: { value: 'My node ad' } })
    fireEvent.click(screen.getByTestId('node-ad-save'))
    await waitFor(() => expect(v3.create).toHaveBeenCalled())
    const [collection, body, opts] = (v3.create as any).mock.calls[0]
    expect(collection).toBe('posts')
    expect(body.tags).toEqual(['ad', 'node_ad'])
    expect(body.offer.link).toEqual({ type: 'text', value: 'https://workflowco.com?ref=node' })
    expect(opts.groups).toEqual(['api.localhost/groups/web10/discover'])
  })

  it('disables the create button until a link is provided', async () => {
    renderCard(mockV3([]))
    await screen.findByTestId('node-ads-empty')
    fireEvent.click(screen.getByTestId('node-ads-new'))
    const save = await screen.findByTestId('node-ad-save')
    expect((save as HTMLButtonElement).disabled).toBe(true)
  })
})
