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

function mockLoad(cfg: Record<string, any> = {}) {
  ;(axios.post as any).mockImplementation((url: string) => {
    if (url.includes('/config')) return Promise.resolve({ data: { admins: ['admin'], ...cfg } })
    if (url.includes('/apps/admin')) return Promise.resolve({ data: { apps: [] } })
    if (url.includes('/v3/groups/hidden')) return Promise.resolve({ data: { hidden: [] } })
    if (url.includes('/v3/read')) return Promise.resolve({ data: [] })
    if (url.includes('/config/update')) return Promise.resolve({ data: { status: 'updated' } })
    return Promise.resolve({ data: {} })
  })
}

// The body axios.post received for a given path substring.
function updateBody(): any {
  const call = (axios.post as any).mock.calls.find((c: any[]) =>
    String(c[0]).includes('/config/update'),
  )
  return call ? call[1] : undefined
}

describe('ConfigPage telemetry (D56)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders only PostHog controls, even with historical vendor settings', async () => {
    mockLoad({ ga4_measurement_id: 'G-EXISTING', hotjar_site_id: '42', posthog_project_key: 'phc_existing_project' })
    render(<ConfigPage I={mockI as any} />)
    await waitFor(() =>
      expect(screen.getByTestId('config-telemetry-card')).toBeInTheDocument(),
    )
    expect((screen.getByTestId('config-posthog-key') as HTMLInputElement).value).toBe('phc_existing_project')
    expect(screen.queryByTestId('config-ga4-id')).not.toBeInTheDocument()
    expect(screen.queryByTestId('config-hotjar-id')).not.toBeInTheDocument()
  })

  it('Save sends the nested {token:{token}, update:{...}} shape with the changed telemetry field', async () => {
    mockLoad({ posthog_project_key: '' })
    render(<ConfigPage I={mockI as any} />)
    const key = await screen.findByTestId('config-posthog-key')
    fireEvent.change(key, { target: { value: 'phc_new_project' } })
    fireEvent.click(screen.getByTestId('config-save-button'))
    await waitFor(() => expect(updateBody()).toBeDefined())
    // The API takes two body models — token (nested) + update (the diff).
    expect(updateBody()).toEqual({
      token: { token: 'admin-token' },
      update: { posthog_project_key: 'phc_new_project' },
    })
  })

  it('an unchanged field stays off the wire (diff-only save)', async () => {
    mockLoad({ posthog_project_key: 'phc_same_project', posthog_replay_enabled: false })
    render(<ConfigPage I={mockI as any} />)
    const replay = await screen.findByTestId('config-posthog-replay')
    fireEvent.click(replay)
    fireEvent.click(screen.getByTestId('config-save-button'))
    await waitFor(() => expect(updateBody()).toBeDefined())
    // Only the changed field is sent; the project key is untouched.
    expect(updateBody()).toEqual({
      token: { token: 'admin-token' },
      update: { posthog_replay_enabled: true },
    })
  })

  it('adding an admin sends the nested shape with update.admins', async () => {
    mockLoad({})
    render(<ConfigPage I={mockI as any} />)
    const addInput = await screen.findByTestId('config-admin-add-input')
    fireEvent.change(addInput, { target: { value: 'newadmin' } })
    fireEvent.click(screen.getByTestId('config-admin-add-button'))
    await waitFor(() => expect(updateBody()).toBeDefined())
    expect(updateBody()).toEqual({
      token: { token: 'admin-token' },
      update: { admins: ['admin', 'newadmin'] },
    })
  })

  it('renders disabled-by-default PostHog settings and saves only the new configuration', async () => {
    mockLoad({ posthog_enabled: false, posthog_project_key: '', posthog_host: 'https://us.i.posthog.com' })
    render(<ConfigPage I={mockI as any} />)
    const enabled = await screen.findByTestId('config-posthog-enabled')
    expect(enabled).not.toBeChecked()
    fireEvent.change(screen.getByTestId('config-posthog-key'), { target: { value: 'phc_synthetic_project' } })
    fireEvent.change(screen.getByTestId('config-posthog-host'), { target: { value: 'https://eu.i.posthog.com' } })
    fireEvent.click(enabled)
    fireEvent.click(screen.getByTestId('config-save-button'))
    await waitFor(() => expect(updateBody()).toBeDefined())
    expect(updateBody()).toEqual({ token: { token: 'admin-token' }, update: {
      posthog_enabled: true, posthog_project_key: 'phc_synthetic_project', posthog_host: 'https://eu.i.posthog.com',
    } })
    expect(screen.getByText(/separate identity secret/)).toBeInTheDocument()
  })
})
