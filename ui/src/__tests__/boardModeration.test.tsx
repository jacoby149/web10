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

const POST = {
  author: 'alice',
  service: 'public_posts',
  doc_id: 'p1',
  body: { text: 'something inappropriate', tags: [] },
  created_at: '2026-07-27T00:00:00',
}

function mockLoad({ board = [POST], removed = [] }: { board?: any[]; removed?: any[] } = {}) {
  ;(axios.post as any).mockImplementation((url: string) => {
    if (url.includes('/config')) return Promise.resolve({ data: { admins: ['admin'] } })
    if (url.includes('/apps/admin')) return Promise.resolve({ data: { apps: [] } })
    if (url.includes('/admin/discovery/removed')) return Promise.resolve({ data: { removed } })
    if (url.includes('/admin/discovery/remove')) return Promise.resolve({ data: { matched: 1 } })
    if (url.includes('/admin/discovery/restore')) return Promise.resolve({ data: { matched: 1 } })
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

  it('remove flow posts author/service/post_id/reason and drops the row', async () => {
    mockLoad()
    render(<ConfigPage I={mockI} />)
    fireEvent.click(await screen.findByTestId('config-mod-remove-p1'))
    fireEvent.change(screen.getByTestId('config-mod-reason-p1'), { target: { value: 'spam' } })
    fireEvent.click(screen.getByTestId('config-mod-confirm-remove-p1'))
    await waitFor(() => {
      const calls = (axios.post as any).mock.calls
      const removeCall = calls.find((c: any[]) => c[0].endsWith('/admin/discovery/remove'))
      expect(removeCall).toBeTruthy()
      expect(removeCall[1]).toMatchObject({
        token: 'admin-token',
        author: 'alice',
        service: 'public_posts',
        post_id: 'p1',
        reason: 'spam',
      })
    })
    await waitFor(() => expect(screen.queryByTestId('config-mod-row-p1')).toBeNull())
  })

  it('removed posts list restores via /admin/discovery/restore', async () => {
    mockLoad({
      board: [],
      removed: [{ author: 'alice', service: 'public_posts', post_id: 'p1', body_text: 'something inappropriate', removed_by: 'admin', removal_reason: 'spam' }],
    })
    render(<ConfigPage I={mockI} />)
    const row = await screen.findByTestId('config-mod-removed-row-p1')
    expect(row.textContent).toContain('removed by admin')
    fireEvent.click(screen.getByTestId('config-mod-restore-p1'))
    await waitFor(() => {
      const calls = (axios.post as any).mock.calls
      const restoreCall = calls.find((c: any[]) => c[0].includes('/admin/discovery/restore'))
      expect(restoreCall).toBeTruthy()
      expect(restoreCall[1]).toMatchObject({ author: 'alice', post_id: 'p1' })
    })
  })

  it('empty board renders a calm empty state', async () => {
    mockLoad({ board: [] })
    render(<ConfigPage I={mockI} />)
    expect(await screen.findByTestId('config-mod-empty')).toBeTruthy()
  })
})
