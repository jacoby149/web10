import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ConfigPage from '../components/Config/ConfigPage'
import axios from 'axios'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))

const I = {
  isAdmin: true,
  v3: { state: { token: 'synthetic-admin' }, readToken: () => ({ provider: 'api.localhost' }) },
}

describe('App Store approvals disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/?page=config&keep=yes#settings')
    vi.mocked(axios.post).mockImplementation(async (url) => ({ data:
      String(url).endsWith('/v3/apps/admin')
        ? { apps: [{ url: 'https://example.com/app', approved: false }] }
        : { admins: ['admin'] },
    }))
  })

  it('starts collapsed while keeping the pending count visible', async () => {
    render(<ConfigPage I={I} />)
    const toggle = await screen.findByTestId('config-appstore-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('config-appstore-content')).not.toBeVisible()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 pending app'))
    expect(screen.getByRole('status')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('opens and closes without losing other URL state or changing policy', async () => {
    render(<ConfigPage I={I} />)
    const toggle = await screen.findByTestId('config-appstore-toggle')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible()
    expect(window.location.search).toBe('?page=config&keep=yes&mode=config&approvals=open')
    expect(window.location.hash).toBe('#settings')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(window.location.search).toBe('?page=config&keep=yes&mode=config')
    expect(vi.mocked(axios.post).mock.calls.some(([url]) => String(url).includes('/config/update'))).toBe(false)
  })

  it('restores an open deep link and follows browser history', async () => {
    window.history.replaceState(null, '', '/?page=config&approvals=open')
    render(<ConfigPage I={I} />)
    const toggle = await screen.findByTestId('config-appstore-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    window.history.pushState(null, '', '/?page=config')
    fireEvent.popState(window)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    window.history.pushState(null, '', '/?page=config&approvals=open')
    fireEvent.popState(window)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('makes a failed read visible while collapsed', async () => {
    vi.mocked(axios.post).mockImplementation(async (url) => {
      if (String(url).endsWith('/v3/apps/admin')) throw new Error('synthetic outage')
      return { data: { admins: ['admin'] } }
    })
    render(<ConfigPage I={I} />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not load apps'))
    fireEvent.click(screen.getByTestId('config-appstore-toggle'))
    expect(screen.getByTestId('config-apps-error')).toBeVisible()
  })
})
