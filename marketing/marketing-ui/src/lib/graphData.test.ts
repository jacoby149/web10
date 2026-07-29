import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchGraphData, extractUsernameFromTarget } from './graphData'

// We need the extractUsernameFromTarget helper — let's re-export it for testing
// Actually it's not exported. Let's test the public API only.

// Stub fetch
const mockFetch = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchGraphData', () => {
  it('returns nodes and edges from follow entries + discover users', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => [
        { author: 'alice', target: 'follow:bob@api.web10.app', payload: { action: 'follow' } },
        { author: 'bob', target: 'follow:carol@api.web10.app', payload: { action: 'follow' } },
        { author: 'alice', target: 'follow:carol@api.web10.app', payload: { action: 'follow' } },
        // non-follow entry should be filtered out
        { author: 'alice', target: 'react:carol/post/1', payload: { action: 'reaction' } },
      ],
    })
    mockFetch.mockResolvedValueOnce({
      json: async () => [
        { username: 'alice', followers_count: 5 },
        { username: 'bob', followers_count: 2 },
        { username: 'carol', followers_count: 0 },
      ],
    })

    const data = await fetchGraphData()

    expect(data.nodes).toHaveLength(3)
    const usernames = data.nodes.map(n => n.username).sort()
    expect(usernames).toEqual(['alice', 'bob', 'carol'])

    // alice has 5 followers from discover, bob 2, carol 0
    const aliceNode = data.nodes.find(n => n.username === 'alice')!
    expect(aliceNode.followersCount).toBe(5)

    // 3 edges: alice->bob, bob->carol, alice->carol
    expect(data.edges).toHaveLength(3)
  })

  it('handles empty data gracefully', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => [] })
    mockFetch.mockResolvedValueOnce({ json: async () => [] })

    const data = await fetchGraphData()
    expect(data.nodes).toHaveLength(0)
    expect(data.edges).toHaveLength(0)
  })

  it('deduplicates edges', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => [
        { author: 'a', target: 'follow:b@api.web10.app', payload: { action: 'follow' } },
        { author: 'a', target: 'follow:b@api.web10.app', payload: { action: 'follow' } },
      ],
    })
    mockFetch.mockResolvedValueOnce({ json: async () => [] })

    const data = await fetchGraphData()
    expect(data.edges).toHaveLength(1)
  })

  it('merges discover users with ledger-only users', async () => {
    // dave only appears in the ledger, not in discover
    mockFetch.mockResolvedValueOnce({
      json: async () => [
        { author: 'alice', target: 'follow:dave@api.web10.app', payload: { action: 'follow' } },
      ],
    })
    mockFetch.mockResolvedValueOnce({
      json: async () => [
        { username: 'alice', followers_count: 3 },
      ],
    })

    const data = await fetchGraphData()
    expect(data.nodes).toHaveLength(2)
    const dave = data.nodes.find(n => n.username === 'dave')!
    expect(dave.followersCount).toBe(0)
  })
})