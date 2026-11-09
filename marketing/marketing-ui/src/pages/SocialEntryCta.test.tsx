import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from './Home'
import Freedom from './Freedom'
import { SOCIAL_ORIGIN } from '../lib/origins'

vi.mock('../lib/analytics', () => ({ trackFunnel: vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('explicit social entry label', () => {
  it.each([['Home', Home], ['Freedom', Freedom]] as const)('%s names the app without changing its destination', async (_name, Page) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await act(async () => { render(<Page />) })
    expect(screen.getByRole('link', { name: 'Go to web10 social', exact: true })).toHaveAttribute('href', SOCIAL_ORIGIN)
    expect(screen.queryByRole('link', { name: /^Enter web10/ })).not.toBeInTheDocument()
  })
})
