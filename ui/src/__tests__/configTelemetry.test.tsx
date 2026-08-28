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

  it('renders the GA4 + Hotjar fields with loaded values', async () => {
    mockLoad({ ga4_measurement_id: 'G-EXISTING', hotjar_site_id: '42' })
    render(<ConfigPage I={mockI as any} />)
    await waitFor(() =>
      expect(screen.getByTestId('config-telemetry-card')).toBeInTheDocument(),
    )
    expect(
      (screen.getByTestId('config-ga4-id') as HTMLInputElement).value,
    ).toBe('G-EXISTING')
    expect(
      (screen.getByTestId('config-hotjar-id') as HTMLInputElement).value,
    ).toBe('42')
  })

  it('Save sends the nested {token:{token}, update:{...}} shape with the changed telemetry field', async () => {
    mockLoad({ ga4_measurement_id: '', hotjar_site_id: '' })
    render(<ConfigPage I={mockI as any} />)
    const ga4 = await screen.findByTestId('config-ga4-id')
    fireEvent.change(ga4, { target: { value: 'G-NEW' } })
    fireEvent.click(screen.getByTestId('config-save-button'))
    await waitFor(() => expect(updateBody()).toBeDefined())
    // The API takes two body models — token (nested) + update (the diff).
    expect(updateBody()).toEqual({
      token: { token: 'admin-token' },
      update: { ga4_measurement_id: 'G-NEW' },
    })
  })

  it('an unchanged field stays off the wire (diff-only save)', async () => {
    mockLoad({ ga4_measurement_id: 'G-SAME', hotjar_site_id: '7' })
    render(<ConfigPage I={mockI as any} />)
    const hotjar = await screen.findByTestId('config-hotjar-id')
    fireEvent.change(hotjar, { target: { value: '8' } })
    fireEvent.click(screen.getByTestId('config-save-button'))
    await waitFor(() => expect(updateBody()).toBeDefined())
    // Only the changed field is sent; ga4_measurement_id is untouched.
    expect(updateBody()).toEqual({
      token: { token: 'admin-token' },
      update: { hotjar_site_id: '8' },
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
})