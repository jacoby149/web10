import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from './Home'
import Join from './Join'
import Freedom from './Freedom'

vi.mock('../lib/analytics', () => ({ trackFunnel: vi.fn() }))

describe('Marketing legal footer links', () => {
  it.each([['Home', Home], ['Join', Join], ['Freedom', Freedom]] as const)(
    '%s links Privacy immediately after Terms', async (_name, Page) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
      await act(async () => { render(<Page />) })
      const footer = within(screen.getByRole('contentinfo'))
      const terms = footer.getByRole('link', { name: 'Terms' })
      const privacy = footer.getByRole('link', { name: 'Privacy' })
      expect(terms).toHaveAttribute('href', '/docs/terms')
      expect(privacy).toHaveAttribute('href', '/docs/privacy')
      expect(terms.nextElementSibling).toBe(privacy)
    },
  )
})
