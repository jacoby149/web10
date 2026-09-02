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
  v3: {
    state: { token: 'admin-token' },
    readToken: () => ({ provider: 'api.localhost', username: 'admin' }),
  },
}

function mockLoad(cfg: Record<string, any> = {}, flags: any[] = []) {
  ;(axios.post as any).mockImplementation((url: string) => {
    if (url.includes('/config')) return Promise.resolve({ data: { admins: ['admin'], ...cfg } })
    if (url.includes('/apps/admin')) return Promise.resolve({ data: { apps: [] } })
    if (url.includes('/v3/groups/hidden')) return Promise.resolve({ data: { hidden: [] } })
    if (url.includes('/v3/read')) return Promise.resolve({ data: [] })
    if (url.includes('/v3/moderation/flags')) return Promise.resolve({ data: { flags } })
    if (url.includes('/v3/moderation/auto-hide'))
      return Promise.resolve({ data: { auto_hide_users: ['baduser'] } })
    if (url.includes('/config/update')) return Promise.resolve({ data: { status: 'updated' } })
    return Promise.resolve({ data: {} })
  })
}

function updateBody(): any {
  const call = (axios.post as any).mock.calls.find((c: any[]) =>
    String(c[0]).includes('/config/update'),
  )
  return call ? call[1] : undefined
}

function autoHideBody(): any {
  const call = (axios.post as any).mock.calls.find((c: any[]) =>
    String(c[0]).includes('/v3/moderation/auto-hide'),
  )
  return call ? call[1] : undefined
}

describe('ConfigPage content moderation (D57)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the card with the two toggles and the blocklist', async () => {
    mockLoad({
      moderation_enabled: true,
      auto_moderate: true,
      sensitive_words: ['nigger', 'kike'],
    })
    render(<ConfigPage I={mockI as any} />)
    await waitFor(() =>
      expect(screen.getByTestId('config-content-moderation-card')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('config-moderation-enabled')).toBeInTheDocument()
    expect(screen.getByTestId('config-moderation-auto')).toBeInTheDocument()
    expect(screen.getByTestId('config-moderation-word-nigger')).toBeInTheDocument()
    expect(screen.getByTestId('config-moderation-word-kike')).toBeInTheDocument()
  })

  it('toggling auto-hide sends the diff-only nested save', async () => {
    mockLoad({ moderation_enabled: true, auto_moderate: true, sensitive_words: [] })
    render(<ConfigPage I={mockI as any} />)
    const auto = await screen.findByTestId('config-moderation-auto')
    fireEvent.click(auto)
    fireEvent.click(screen.getByTestId('config-save-button'))
    await waitFor(() => expect(updateBody()).toBeDefined())
    expect(updateBody()).toEqual({
      token: { token: 'admin-token' },
      update: { auto_moderate: false },
    })
  })

  it('adding a word appends to sensitive_words on save', async () => {
    mockLoad({ moderation_enabled: true, auto_moderate: true, sensitive_words: ['nigger'] })
    render(<ConfigPage I={mockI as any} />)
    const input = await screen.findByTestId('config-moderation-word-input')
    fireEvent.change(input, { target: { value: 'spic' } })
    fireEvent.click(screen.getByTestId('config-moderation-word-add'))
    expect(screen.getByTestId('config-moderation-word-spic')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('config-save-button'))
    await waitFor(() => expect(updateBody()).toBeDefined())
    expect(updateBody()).toEqual({
      token: { token: 'admin-token' },
      update: { sensitive_words: ['nigger', 'spic'] },
    })
  })

  it('removing a word drops it from sensitive_words on save', async () => {
    mockLoad({ moderation_enabled: true, auto_moderate: true, sensitive_words: ['nigger', 'kike'] })
    render(<ConfigPage I={mockI as any} />)
    fireEvent.click(await screen.findByTestId('config-moderation-word-remove-kike'))
    fireEvent.click(screen.getByTestId('config-save-button'))
    await waitFor(() => expect(updateBody()).toBeDefined())
    expect(updateBody()).toEqual({
      token: { token: 'admin-token' },
      update: { sensitive_words: ['nigger'] },
    })
  })

  it('the review queue lists flagged users and "Keep hiding" calls the auto-hide endpoint', async () => {
    mockLoad(
      { moderation_enabled: true, auto_moderate: true, sensitive_words: [], auto_hide_users: [] },
      [{ username: 'baduser', flag_count: 3, last_flagged: '2026-08-30', matched_words: ['nigger'] }],
    )
    render(<ConfigPage I={mockI as any} />)
    const flag = await screen.findByTestId('config-moderation-flag-baduser')
    expect(flag).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('config-moderation-flag-toggle-baduser'))
    await waitFor(() => expect(autoHideBody()).toBeDefined())
    expect(autoHideBody()).toEqual({
      token: 'admin-token',
      username: 'baduser',
      hide: true,
    })
  })

  it('a flagged user already on the auto-hide list shows the "Hiding" state', async () => {
    mockLoad(
      { moderation_enabled: true, auto_moderate: true, sensitive_words: [], auto_hide_users: ['baduser'] },
      [{ username: 'baduser', flag_count: 1, last_flagged: '2026-08-30', matched_words: ['kike'] }],
    )
    render(<ConfigPage I={mockI as any} />)
    const toggle = await screen.findByTestId('config-moderation-flag-toggle-baduser')
    expect(toggle).toHaveTextContent('Hiding')
  })

  it('an empty queue shows the empty state', async () => {
    mockLoad({ moderation_enabled: true, auto_moderate: true, sensitive_words: [] }, [])
    render(<ConfigPage I={mockI as any} />)
    await waitFor(() =>
      expect(screen.getByTestId('config-moderation-queue-empty')).toBeInTheDocument(),
    )
  })
})
