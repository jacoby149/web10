import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OauthConsentView from '../components/Oauth/OauthConsentView'

vi.mock('../interfaces/authAdapter', () => ({
  default: () => ({}),
}))

// The OAuth consent screen (D92, O8) reads ?oauth=1 + client_id/redirect_uri/
// state from the URL. These tests set window.location.search to exercise the
// signed-in approve/deny path and the unknown-app path.
function makeI(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    isAuthenticated: () => true,
    username: 'alice',
    v3: { readToken: () => ({ username: 'alice', provider: 'api.localhost' }) },
    oauthClientLookup: vi.fn(async () => ({ client_name: 'Muse', redirect_uris: ['https://muse.example.com/callback'] })),
    oauthAuthorize: vi.fn(async () => ({ code: 'abc123', state: null })),
    logout: vi.fn(),
    setStatus: vi.fn(),
    config: { REACT_APP_DEFAULT_API: 'api.localhost' },
    ...overrides,
  }
}

function setSearch(search: string) {
  window.history.replaceState({}, '', search)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('OauthConsentView', () => {
  it('signed-in: shows the client name and approve/deny after lookup', async () => {
    setSearch('/?oauth=1&client_id=muse-connector&redirect_uri=https%3A%2F%2Fmuse.example.com%2Fcallback')
    const I = makeI()
    render(<OauthConsentView I={I} />)
    await waitFor(() => expect(screen.getByTestId('oauth-consent-approve')).toBeTruthy())
    expect(screen.getByText(/wants to act as/i)).toBeTruthy()
    // "alice" appears in both the header and the signed-in footer — assert at least one.
    expect(screen.getAllByText('alice').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('oauth-consent-deny')).toBeTruthy()
    // The callback host is shown.
    expect(screen.getByText('muse.example.com')).toBeTruthy()
  })

  it('approve calls oauthAuthorize with the params', async () => {
    setSearch('/?oauth=1&client_id=muse-connector&redirect_uri=https%3A%2F%2Fmuse.example.com%2Fcallback&state=xyz')
    const I = makeI()
    render(<OauthConsentView I={I} />)
    const approve = await screen.findByTestId('oauth-consent-approve')
    fireEvent.click(approve)
    await waitFor(() => expect(I.oauthAuthorize).toHaveBeenCalled())
    const arg = I.oauthAuthorize.mock.calls[0][0]
    expect(arg.client_id).toBe('muse-connector')
    expect(arg.redirect_uri).toBe('https://muse.example.com/callback')
    expect(arg.state).toBe('xyz')
  })

  it('unknown client shows the "Unknown app" state (no approve)', async () => {
    setSearch('/?oauth=1&client_id=ghost&redirect_uri=https%3A%2F%2Fmuse.example.com%2Fcallback')
    const I = makeI({ oauthClientLookup: vi.fn(async () => { throw new Error('404') }) })
    render(<OauthConsentView I={I} />)
    await waitFor(() => expect(screen.getByTestId('oauth-consent-unknown')).toBeTruthy())
    expect(screen.queryByTestId('oauth-consent-approve')).toBeFalsy()
  })

  it('signed-out: shows the login form, not the consent body', () => {
    setSearch('/?oauth=1&client_id=muse-connector&redirect_uri=https%3A%2F%2Fmuse.example.com%2Fcallback')
    const I = makeI({ isAuthenticated: () => false, username: '' })
    render(<OauthConsentView I={I} />)
    expect(screen.getByTestId('login-submit')).toBeTruthy()
    expect(screen.queryByTestId('oauth-consent-approve')).toBeFalsy()
  })
})
