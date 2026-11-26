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
  it('Freedom invites exploration without a signup ask', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await act(async () => { render(<Freedom />) })
    expect(screen.getByRole('link', { name: 'Explore web10', exact: true })).toHaveAttribute('href', SOCIAL_ORIGIN)
    expect(screen.queryByRole('link', { name: /^Enter web10/ })).not.toBeInTheDocument()
  })

  // D125: the classic landing's single entry CTA goes into the social app
  // (operator, 25.11.2026: "should JUST be Enter web10 social").
  it('Home carries one entry CTA into the social app', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await act(async () => { render(<Home />) })
    expect(screen.getByRole('link', { name: 'Enter web10 social', exact: true })).toHaveAttribute('href', SOCIAL_ORIGIN)
  })

  it('names the social destination in desktop and mobile navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stargazers_count: 0 }) }))
    await act(async () => { render(<MemoryRouter><Navbar /></MemoryRouter>) })
    expect(screen.getAllByRole('button', { name: 'Open web10 social', exact: true })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu', exact: true }))
    expect(screen.getAllByRole('button', { name: 'Open web10 social', exact: true })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Sign In', exact: true })).not.toBeInTheDocument()
  })

  it.each(['/', '/app-store', '/audience'])('supplies both navbar logo variants at %s', async (path) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stargazers_count: 0 }) }))
    await act(async () => { render(<MemoryRouter initialEntries={[path]}><Navbar /></MemoryRouter>) })
    const nav = screen.getByRole('navigation', { name: 'main navigation' })
    expect(nav).toHaveClass('classic-surface')
    expect(nav.querySelector('[data-brand-variant="white"]')).toHaveAttribute('src', '/brand/logo-lockup.png')
    expect(nav.querySelector('[data-brand-variant="dark"]')).toHaveAttribute('src', '/brand/logo-lockup-dark.png')
  })
})
