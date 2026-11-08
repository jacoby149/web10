import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
describe('PostHog-only authenticator', () => {
  it('does not load legacy vendors even if old IDs remain in saved config', async () => {
    const script = vi.spyOn(document.head, 'appendChild')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      posthog_enabled: false, ga4_measurement_id: 'G-OLD', hotjar_site_id: '123',
    }) }))
    const analytics = await import('../lib/analytics')
    await analytics.installTelemetry()
    expect(script).not.toHaveBeenCalled()
    expect(() => analytics.trackPageview('/?token=private')).not.toThrow()
    expect(analytics.acquisitionTicket()).toBeNull()
    script.mockRestore()
  })
})
