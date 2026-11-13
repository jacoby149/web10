import { describe, expect, it, vi, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import SocialRedirect, { legacyTrendingUrl } from './SocialRedirect'
import { SOCIAL_ORIGIN } from '../lib/origins'

const social = SOCIAL_ORIGIN.replace(/\/$/, '')
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('legacy marketing discovery handoff', () => {
  it('replaces history once even in StrictMode, offers a fallback and never reads a feed', () => {
    const replace = vi.fn()
    const fetcher = vi.fn()
    const original = window
    vi.stubGlobal('window', new Proxy(original, { get: (target, key) => key === 'location' ? { replace } : Reflect.get(target, key) }))
    vi.stubGlobal('fetch', fetcher)
    render(<StrictMode><MemoryRouter initialEntries={['/trending']}><SocialRedirect /></MemoryRouter></StrictMode>)
    expect(replace).toHaveBeenCalledExactlyOnceWith(`${social}/feed`)
    expect(screen.getByRole('link', { name: 'Continue to web10 social' })).toHaveAttribute('href', `${social}/feed`)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    ['/trending', 'feed'], ['/trending/', 'feed'], ['/trending/posts', 'feed'],
    ['/trending/hot-gossip', 'feed'], ['/trending/unknown', 'feed'],
    ['/trending/video', 'video'], ['/trending/shorts', 'shorts'],
    ['/trending/people', 'people'], ['/groups', 'people'],
  ])('%s opens social /%s', (path, destination) => {
    expect(legacyTrendingUrl(path, '')).toBe(`${social}/${destination}`)
  })

  it('retains supported public filters without copying secrets or API/server overrides', () => {
    const url = new URL(legacyTrendingUrl('/trending/posts', '?q=hello%20world&tag=music&post=p1&knobs=1,2,3,2,2&token=SECRET&api=https://foreign.example&servers=PRIVATE&focus=search&view=grid'))
    expect(url.pathname).toBe('/feed')
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'hello world', tag: 'music', post: 'p1', knobs: '1,2,3,2,2' })
    expect(url.href).not.toMatch(/SECRET|PRIVATE|foreign/)
  })

  it('retains legacy People links and directory state without forcing a login', () => {
    const url = new URL(legacyTrendingUrl('/trending', '?tab=profiles&section=groups&peopleSort=newest&groupSort=popular&q=music'))
    expect(url.pathname).toBe('/people')
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'music', section: 'groups', peopleSort: 'newest', groupSort: 'popular' })
  })

  it('honors the configured social destination rather than hardcoding production', async () => {
    vi.stubEnv('VITE_SOCIAL_URL', 'https://social.example/')
    vi.resetModules()
    const { legacyTrendingUrl: configured } = await import('./SocialRedirect')
    const { SOCIAL_FEED_URL } = await import('../lib/origins')
    expect(SOCIAL_FEED_URL).toBe('https://social.example/feed')
    expect(configured('/trending/video', '')).toBe('https://social.example/video')
  })
})
