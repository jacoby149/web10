import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

import axios from 'axios'
import ConfigPage from '../components/Config/ConfigPage'

const mockI = {
  isAdmin: true,
  wapi: {
    token: 'admin-token',
    readToken: () => ({ provider: 'api.localhost', username: 'admin' }),
  },
  v3: {
    state: { token: 'admin-token' },
    readToken: () => ({ provider: 'api.localhost', username: 'admin' }),
  },
}

// The v3 public board is the node-default discover group, read anon through
// /v3/read (the normal group-read path). Board posts are v3 documents
// (author_key / doc_id / body.text) — ConfigPage maps them to its BoardPost
// shape. Removed posts come from /v3/groups/hidden (the discover group's
// hidden-doc list). Remove/restore are /v3/groups/hide and /v3/groups/unhide.
const DISCOVER_GROUP = 'web10.app/groups/web10/discover'

const BOARD_DOC = {
  author_key: 'alice',
  service: 'public_posts',
  doc_id: 'p1',
  body: { text: 'something inappropriate' },
  tags: [],
  created_at: '2026-07-27T00:00:00',
}

const HIDDEN_DOC = {
  author_key: 'alice',
  doc_id: 'p1',
  body: { text: 'something inappropriate' },
  hidden_at: '2026-07-27T00:00:00',
  moderator_key: 'admin',
}

function mockLoad({ board = [BOARD_DOC], hidden = [] }: { board?: any[]; hidden?: any[] } = {}) {
  ;(axios.post as any).mockImplementation((url: string) => {
    if (url.includes('/config')) return Promise.resolve({ data: { admins: ['admin'] } })
    if (url.includes('/apps/admin')) return Promise.resolve({ data: { apps: [] } })
    if (url.includes('/v3/groups/hidden')) return Promise.resolve({ data: { hidden } })
    if (url.includes('/v3/groups/hide')) return Promise.resolve({ data: {} })
    if (url.includes('/v3/groups/unhide')) return Promise.resolve({ data: {} })
    if (url.includes('/v3/read')) return Promise.resolve({ data: board })
    return Promise.resolve({ data: {} })
  })
  ;(axios.patch as any).mockImplementation(() => Promise.resolve({ data: {} }))
}

describe('ConfigPage board moderation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists public board posts with remove buttons', async () => {
    mockLoad()
    render(<ConfigPage I={mockI} />)
    const row = await screen.findByTestId('config-mod-row-p1')
    expect(row.textContent).toContain('@alice')
    expect(row.textContent).toContain('something inappropriate')
    expect(screen.getByTestId('config-mod-remove-p1')).toBeTruthy()
  })

  it('remove flow posts to /v3/groups/hide and drops the row', async () => {
    mockLoad()
    render(<ConfigPage I={mockI} />)
    fireEvent.click(await screen.findByTestId('config-mod-remove-p1'))
    fireEvent.change(screen.getByTestId('config-mod-reason-p1'), { target: { value: 'spam' } })
    fireEvent.click(screen.getByTestId('config-mod-confirm-remove-p1'))
    await waitFor(() => {
      const calls = (axios.post as any).mock.calls
      const removeCall = calls.find((c: any[]) => c[0].includes('/v3/groups/hide'))
      expect(removeCall).toBeTruthy()
      expect(removeCall[1]).toMatchObject({
        token: 'admin-token',
        group_id: DISCOVER_GROUP,
        doc_id: 'p1',
        reason: 'spam',
      })
    })
    await waitFor(() => expect(screen.queryByTestId('config-mod-row-p1')).toBeNull())
  })

  it('removed posts list (from /v3/groups/hidden) restores via /v3/groups/unhide', async () => {
    mockLoad({ board: [], hidden: [HIDDEN_DOC] })
    render(<ConfigPage I={mockI} />)
    const row = await screen.findByTestId('config-mod-removed-row-p1')
    expect(row.textContent).toContain('@alice')
    expect(row.textContent).toContain('removed by admin')
    fireEvent.click(screen.getByTestId('config-mod-restore-p1'))
    await waitFor(() => {
      const calls = (axios.post as any).mock.calls
      const restoreCall = calls.find((c: any[]) => c[0].includes('/v3/groups/unhide'))
      expect(restoreCall).toBeTruthy()
      expect(restoreCall[1]).toMatchObject({
        token: 'admin-token',
        group_id: DISCOVER_GROUP,
        doc_id: 'p1',
      })
    })
  })

  it('empty board renders a calm empty state', async () => {
    mockLoad({ board: [] })
    render(<ConfigPage I={mockI} />)
    expect(await screen.findByTestId('config-mod-empty')).toBeTruthy()
  })
})
