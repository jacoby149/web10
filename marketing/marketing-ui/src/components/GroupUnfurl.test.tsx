// Group detail still uses Markdown/unfurl; its coverage survives feed retirement.
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { __resetUnfurlCacheForTests } from '@web10/discover'
import GroupDetail from '../pages/GroupDetail'
import { SOCIAL_ORIGIN } from '../lib/origins'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); __resetUnfurlCacheForTests() })

it('unfurls group post links through social without a marketing feed', async () => {
  const group = 'api.web10.app/groups/creator/music'
  const track = 'https://open.spotify.com/track/xyz'
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = String(input)
    let data: unknown
    if (url.startsWith(`${SOCIAL_ORIGIN}/preview/unfurl`)) {
      calls.push(url)
      data = { ok: true, card: { url: track, domain: 'spotify.com', provider: 'spotify', title: 'Blinding Lights', description: 'The Weeknd', image: null,
        embed: { src: 'https://open.spotify.com/embed/track/xyz', height: 152, width: null, allow: 'autoplay; encrypted-media' } } }
    } else if (url.includes('/v3/groups/detail')) {
      data = { group_id: group, name: 'music', owner: 'creator', slug: 'music', join_policy: 'open', discoverable: true, member_count: 3,
        permission_summary: 'open', is_member: false, posts_state: 'ok',
        posts: [{ doc_id: 'p1', author_key: 'api.web10.app/users/creator', body: { text: `Blinding Lights\n${track}` }, created_at: '2026-11-01T12:00:00Z' }] }
    } else if (url.includes('/v3/read')) data = []
    else throw new Error(`Unexpected group request: ${url}`)
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  }))
  render(<MemoryRouter initialEntries={[`/groups/${encodeURIComponent(group)}`]}><Routes><Route path="/groups/:id" element={<GroupDetail />} /></Routes></MemoryRouter>)
  await screen.findAllByText('@creator')
  const player = await screen.findByTestId('unfurl-player')
  expect(player.querySelector('iframe')).toHaveAttribute('src', 'https://open.spotify.com/embed/track/xyz')
  expect(screen.queryByTestId('unfurl-player-placeholder')).toBeNull()
  expect(calls).toEqual([`${SOCIAL_ORIGIN}/preview/unfurl?url=${encodeURIComponent(track)}`])
})
