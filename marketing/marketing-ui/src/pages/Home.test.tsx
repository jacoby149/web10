import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from './Home'
import { trackFunnel } from '../lib/analytics'
import { SOCIAL_ORIGIN } from '../lib/origins'

vi.mock('../lib/analytics', () => ({ trackFunnel: vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function renderHome(stats: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => stats }))
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  return act(async () => { render(<Home />) })
}

describe('classic landing (D125)', () => {
  it('leads with the Revolution hero and the operator-approved sub copy', async () => {
    await renderHome()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('The web10 Revolution')
    // Restored pre-D13 sub copy (operator, 25.11.2026): "domain name" = the
    // user's own web10 address, not a DNS purchase. The original line
    // reads better than the vault-key tightening.
    expect(screen.getByText(/Get a domain name to start owning your photos, music, and data on the internet\./)).toBeInTheDocument()
    // The always-dark surface is scoped on the page root (index.css).
    expect(document.querySelector('.classic-surface')).not.toBeNull()
  })

  it('has a single entry CTA into the social app (operator: "JUST be Enter web10 social")', async () => {
    await renderHome()
    expect(screen.getByRole('link', { name: 'Enter web10 social', exact: true }))
      .toHaveAttribute('href', SOCIAL_ORIGIN)
    expect(screen.queryByRole('link', { name: 'Enter web10', exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Explore web10', exact: true })).not.toBeInTheDocument()
  })

  it('fires the allowlisted CTA event, not content', async () => {
    await renderHome()
    fireEvent.click(screen.getByRole('link', { name: 'Enter web10 social', exact: true }))
    expect(trackFunnel).toHaveBeenCalledWith('enter_click')
    // Landing is reported once on mount.
    expect(trackFunnel).toHaveBeenCalledWith('landing')
  })

  it('keeps the three original features', async () => {
    await renderHome()
    expect(screen.getByRole('heading', { name: 'Peer to Peer' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Own Your Data' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Data Freedom' })).toBeInTheDocument()
    // "on your domain", restored (operator, 25.11.2026): the pre-D13 line
    // reads better than the more accurate "with" rewording.
    expect(screen.getByText(/Your data isn't stuck anymore, it's on your domain on your terms\./)).toBeInTheDocument()
  })

  it('renders the live stats band from /v3/stats', async () => {
    await renderHome({ users: 4321, app_count: 77, storage: 1073741824 })
    const band = within(screen.getByRole('region', { name: 'Network statistics' }))
    expect(band.getByText('4.3K')).toHaveAttribute('title', '4,321')
    expect(band.getByText('77')).toBeInTheDocument()
    expect(band.getByText('data liberated')).toBeInTheDocument()
    expect(band.queryByText('total app visits')).not.toBeInTheDocument()
  })

  it.each([
    [0, '0'], [999, '999'], [1_000, '1K'], [2_345, '2.3K'], [999_999, '1M'],
    [2_345_678, '2.3M'], [2_345_678_901, '2.3B'], [2_345_678_901_234, '2.3T'],
  ])(
    'shows %s counted app visits as %s', async (app_visits, expected) => {
      await renderHome({ users: 42, app_count: 9, storage: 1073741824, app_visits })
      const band = within(screen.getByRole('region', { name: 'Network statistics' }))
      expect(band.getByText('total app visits').previousElementSibling).toHaveTextContent(expected)
    },
  )

  it('holds the stats band with placeholder numerals until the node answers', async () => {
    let release: (value: unknown) => void
    const pending = new Promise((resolve) => { release = resolve })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending))
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await act(async () => { render(<Home />) })

    // The band paints from the outset — every counter slot with its label...
    const band = screen.getByRole('region', { name: 'Network statistics' })
    expect(band).toHaveAttribute('aria-busy', 'true')
    for (const label of ['users', 'apps in the store', 'total app visits', 'data liberated']) {
      expect(within(band).getByText(label)).toBeInTheDocument()
    }
    // ...with placeholder numerals in place.
    expect(within(band).getAllByText('···')).toHaveLength(4)
    expect(within(band).queryByText('4.3K')).not.toBeInTheDocument()

    // ...and the real counts land in the same band when the node answers.
    await act(async () => {
      release({ ok: true, json: async () => ({ users: 4321, app_count: 77, storage: 1073741824 }) })
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(band).toHaveAttribute('aria-busy', 'false')
    expect(within(band).queryByText('···')).not.toBeInTheDocument()
    expect(within(band).getByText('4.3K')).toHaveAttribute('title', '4,321')
    // An answer without app_visits (older nodes) still ends at three counters.
    expect(within(band).queryByText('total app visits')).not.toBeInTheDocument()
  })

  it('drops the stats band quietly when the node is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await act(async () => { render(<Home />) })
    expect(screen.queryByRole('region', { name: 'Network statistics' })).not.toBeInTheDocument()
    // The hero still stands.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The web10 Revolution')
  })

  it('keeps the quiet 2022 pledge after Team and before the footer', async () => {
    await renderHome()
    expect(screen.getByText(/users lead their internet destiny/)).toBeInTheDocument()
    const pledge = screen.getByRole('region', { name: 'The 2022 pledge' })
    expect(screen.getByRole('heading', { name: 'Team' }).compareDocumentPosition(pledge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pledge.compareDocumentPosition(screen.getByRole('contentinfo')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(pledge).getByText('2022')).toBeInTheDocument()
  })

  it('keeps Privacy immediately after Terms in the footer', async () => {
    await renderHome()
    const footer = within(screen.getByRole('contentinfo'))
    const terms = footer.getByRole('link', { name: 'Terms' })
    const privacy = footer.getByRole('link', { name: 'Privacy' })
    expect(terms).toHaveAttribute('href', '/docs/terms')
    expect(privacy).toHaveAttribute('href', '/docs/privacy')
    expect(terms.nextElementSibling).toBe(privacy)
  })

  it('keeps the capital line and the 2022 advisor out of the team grid', async () => {
    await renderHome()
    expect(screen.queryByText('We are currently raising capital')).not.toBeInTheDocument()
    expect(screen.queryByText('Slava Oks')).not.toBeInTheDocument()
    expect(screen.queryByText(/VP of Research/i)).not.toBeInTheDocument()
  })

  it('keeps the founder photo in the 2022 team grid (operator: "the photo of me was cool")', async () => {
    await renderHome()
    const photo = screen.getByRole('img', { name: 'Jacob Hoffman, founder of web10' })
    expect(photo).toHaveAttribute('src', '/founder-2022.jpg')
    expect(photo).toHaveAttribute('loading', 'lazy')
    // Square crop (the original team cards were square, not 4:3).
    expect(photo).toHaveAttribute('width', '640')
    expect(photo).toHaveAttribute('height', '640')
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jacob Hoffman' })).toBeInTheDocument()
    expect(screen.getByText('Founder, web10')).toBeInTheDocument()
  })

  it('retries the same bundled portrait when the image fails', async () => {
    const name = 'Jacob Hoffman, founder of web10'
    await renderHome()
    fireEvent.error(screen.getByRole('img', { name }))
    fireEvent.click(screen.getByRole('button', { name: `Retry image: ${name}` }))
    expect(screen.getByRole('img', { name })).toHaveAttribute('src', '/founder-2022.jpg')
  })
})
