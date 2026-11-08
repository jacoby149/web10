import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ capture: vi.fn(), init: vi.fn() }))
vi.mock('posthog-js/dist/module.full.no-external', () => ({ default: { init: sdk.init } }))

const sources = [
  ['marketing-ui', () => import('./analytics')],
  ['web10-social', () => import('../../../web10-social/src/lib/analytics')],
  ['auth-ui', () => import('../../../../ui/src/lib/analytics')],
] as const

describe.each(sources)('PostHog wiring: %s', (app, load) => {
  beforeEach(() => {
    vi.resetModules()
    sdk.capture.mockReset()
    sdk.init.mockReset().mockReturnValue({ capture: sdk.capture })
    delete (window as any).gtag
    delete (window as any).hj
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ga4_measurement_id: 'G-LEGACY', hotjar_site_id: '123',
      posthog_enabled: true, posthog_project_key: 'phc_synthetic_project', posthog_host: 'https://eu.i.posthog.com',
    }) }))
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => true) })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads PostHog alone and retains the first pageview without sending private URL fields', async () => {
    const analytics = await load()
    analytics.trackPageview('/?token=SECRET&contact=PRIVATE')
    const first = analytics.installTelemetry()
    await first
    expect(sdk.init).toHaveBeenCalledTimes(1)
    expect(sdk.init).toHaveBeenCalledWith('phc_synthetic_project', expect.objectContaining({ api_host: 'https://eu.i.posthog.com' }), expect.any(String))
    expect(sdk.capture).toHaveBeenCalledWith('$pageview', expect.objectContaining({ app, $pathname: '/' }))
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toMatch(/SECRET|PRIVATE/)
    expect((window as any).gtag).toBeUndefined()
    expect((window as any).hj).toBeUndefined()
    await analytics.installTelemetry()
    expect(sdk.init).toHaveBeenCalledTimes(1)
  })

  it('does not fall back to GA4/Hotjar if the selected SDK fails', async () => {
    sdk.init.mockImplementation(() => { throw new Error('SDK failed') })
    const analytics = await load()
    await expect(analytics.installTelemetry()).resolves.toBeUndefined()
    expect((window as any).gtag).toBeUndefined()
    expect((window as any).hj).toBeUndefined()
  })

  it('does not load any vendor for selected but invalid PostHog configuration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      posthog_enabled: true, posthog_project_key: 'phx_private_key',
      ga4_measurement_id: 'G-LEGACY', hotjar_site_id: '123',
    }) }))
    const analytics = await load()
    await analytics.installTelemetry()
    expect(sdk.init).not.toHaveBeenCalled()
    expect((window as any).gtag).toBeUndefined()
    expect((window as any).hj).toBeUndefined()
  })
})
