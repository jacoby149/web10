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
    expect(band.getByText('4,321')).toBeInTheDocument()
    expect(band.getByText('77')).toBeInTheDocument()
    expect(band.getByText('data liberated')).toBeInTheDocument()
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
