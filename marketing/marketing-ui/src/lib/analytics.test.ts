import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackPageview, trackFunnel, reportError } from './analytics'

afterEach(() => vi.unstubAllGlobals())
describe('retained operational beacons', () => {
  it('retains pageview/funnel/error metadata separately from authoritative outcomes', () => {
    const sendBeacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon, userAgent: 'synthetic' })
    trackPageview('/docs')
    trackFunnel('join_click')
    reportError('synthetic error')
    expect(sendBeacon.mock.calls.map((c) => JSON.parse(c[1]).type)).toEqual(['pageview', 'funnel', 'error'])
  })
  it('falls back to fetch when sendBeacon returns false and contains failures', () => {
    vi.stubGlobal('navigator', { sendBeacon: () => false })
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetcher)
    trackPageview('/')
    expect(fetcher).toHaveBeenCalledTimes(1)
    vi.stubGlobal('navigator', { sendBeacon: () => { throw new Error('blocked') } })
    expect(() => trackPageview('/join')).not.toThrow()
  })
})
