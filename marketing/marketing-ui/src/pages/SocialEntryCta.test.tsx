import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import Home from './Home'
import Freedom from './Freedom'
import Navbar from '../components/Navbar'
import { SOCIAL_ORIGIN } from '../lib/origins'

vi.mock('../lib/analytics', () => ({ trackFunnel: vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('social entry copy', () => {
  it.each([['Home', Home], ['Freedom', Freedom]] as const)('%s invites exploration without changing its destination', async (_name, Page) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await act(async () => { render(<Page />) })
    expect(screen.getByRole('link', { name: 'Explore web10', exact: true })).toHaveAttribute('href', SOCIAL_ORIGIN)
    expect(screen.queryByRole('link', { name: /^Enter web10/ })).not.toBeInTheDocument()
  })

  it('names the social destination in desktop and mobile navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stargazers_count: 0 }) }))
    await act(async () => { render(<MemoryRouter><Navbar /></MemoryRouter>) })
    expect(screen.getAllByRole('button', { name: 'Open web10 social', exact: true })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu', exact: true }))
    expect(screen.getAllByRole('button', { name: 'Open web10 social', exact: true })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Sign In', exact: true })).not.toBeInTheDocument()
  })
})
