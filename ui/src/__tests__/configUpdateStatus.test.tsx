import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}))

import axios from 'axios'
import UpdateStatus from '../components/Config/UpdateStatus'

const baseI = {
  isAdmin: true,
  v3: {
    state: { token: 'admin-token' },
    readToken: () => ({ provider: 'api.localhost', username: 'admin' }),
  },
}

const post = (path: string, body: Record<string, any>) =>
  axios.post(`http://api.localhost${path}`, body)

function payload(over: Record<string, any> = {}) {
  return {
    node_version: '5.15.1',
    latest_version: '5.16.0',
    update_available: true,
    upstream: { repo: 'jacoby149/web10', ref: 'main', url: 'https://github.com/jacoby149/web10' },
    status: 'update-available',
    reason: null,
    checked_at: '2026-11-10T12:00:00+00:00',
    cached: false,
    ...over,
  }
}

describe('ConfigPage update status card (the node update check)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the update-available state with both versions and the changelog link', async () => {
    ;(axios.post as any).mockResolvedValue({ data: payload() })
    render(<UpdateStatus I={baseI as any} post={post} />)
    await waitFor(() => expect(screen.getByTestId('config-update-status')).toHaveAttribute('data-status', 'update-available'))
    expect(screen.getByText('Update available')).toBeInTheDocument()
    expect(screen.getByTestId('config-update-version-current')).toHaveTextContent('5.15.1')
    expect(screen.getByTestId('config-update-version-latest')).toHaveTextContent('5.16.0')
    expect(screen.getByTestId('config-update-release-link')).toHaveAttribute(
      'href',
      'https://github.com/jacoby149/web10/blob/main/knowledge-base/changelogs/CHANGELOG.md',
    )
    // The card is honest about the update path — no fake apply button.
    expect(screen.getByTestId('config-update-hint')).toHaveTextContent('not an in-app action')
    expect(screen.queryByRole('button', { name: /update now/i })).not.toBeInTheDocument()
  })

  it('renders the up-to-date state', async () => {
    ;(axios.post as any).mockResolvedValue({ data: payload({ latest_version: '5.15.1', update_available: false, status: 'up-to-date' }) })
    render(<UpdateStatus I={baseI as any} post={post} />)
    await waitFor(() => expect(screen.getByTestId('config-update-status')).toHaveAttribute('data-status', 'up-to-date'))
    expect(screen.getByText('Up to date')).toBeInTheDocument()
    expect(screen.queryByTestId('config-update-hint')).not.toBeInTheDocument()
  })

  it('surfaces the upstream version even when this build reports unknown', async () => {
    ;(axios.post as any).mockResolvedValue({ data: payload({ node_version: 'unknown', update_available: null, status: 'version-unknown' }) })
    render(<UpdateStatus I={baseI as any} post={post} />)
    await waitFor(() => expect(screen.getByTestId('config-update-status')).toHaveAttribute('data-status', 'version-unknown'))
    expect(screen.getByText('Version not reported')).toBeInTheDocument()
    expect(screen.getByTestId('config-update-version-latest')).toHaveTextContent('5.16.0')
  })

  it('degrades to the unavailable state without crashing, keeping the local version', async () => {
    ;(axios.post as any).mockResolvedValue({
      data: payload({ latest_version: null, update_available: null, status: 'unavailable', reason: 'upstream-unreachable:OSError' }),
    })
    render(<UpdateStatus I={baseI as any} post={post} />)
    await waitFor(() => expect(screen.getByTestId('config-update-status')).toHaveAttribute('data-status', 'unavailable'))
    expect(screen.getByText('Update check unavailable')).toBeInTheDocument()
    expect(screen.getByTestId('config-update-version-current')).toHaveTextContent('5.15.1')
    // no "What's new" link when the latest version is unknown
    expect(screen.queryByTestId('config-update-release-link')).not.toBeInTheDocument()
  })

  it('Check now re-fetches with force=true', async () => {
    ;(axios.post as any).mockResolvedValue({ data: payload() })
    render(<UpdateStatus I={baseI as any} post={post} />)
    await screen.findByTestId('config-update-check-now')
    fireEvent.click(screen.getByTestId('config-update-check-now'))
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2))
    expect((axios.post as any).mock.calls[1][0]).toBe('http://api.localhost/admin/update_status?force=true')
    expect((axios.post as any).mock.calls[1][1]).toEqual({ token: 'admin-token' })
  })

  it('an endpoint-less node (404 on the old build) shows the error note, not a crash', async () => {
    ;(axios.post as any).mockRejectedValue({ response: { data: { detail: 'Not Found' } } })
    render(<UpdateStatus I={baseI as any} post={post} />)
    await waitFor(() => expect(screen.getByTestId('config-update-error')).toBeInTheDocument())
    // the API's own detail is surfaced (the house pattern, see ConfigPage's load)
    expect(screen.getByTestId('config-update-error')).toHaveTextContent('Not Found')
    expect(screen.getByTestId('config-update-error')).toHaveTextContent('/admin/update_status')
  })

  it('mock mode renders the canned fixture without touching the network', async () => {
    ;(axios.post as any).mockRejectedValue(new Error('network must not be used in mock mode'))
    render(<UpdateStatus I={{ ...baseI, isMock: true } as any} post={post} />)
    await waitFor(() => expect(screen.getByTestId('config-update-status')).toHaveAttribute('data-status', 'update-available'))
    expect(axios.post).not.toHaveBeenCalled()
    expect(screen.getByText('Update available')).toBeInTheDocument()
  })
})
