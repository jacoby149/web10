import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackPageview, trackFunnel, reportError, installErrorBeacon, loadGa4, loadHotjar, resolveTelemetryIds, installTelemetry, hotjarIdentify } from './analytics'

describe('analytics', () => {
  beforeEach(() => {
    // jsdom doesn't have sendBeacon — define it so spyOn can work
    if (!navigator.sendBeacon) {
      navigator.sendBeacon = () => true
    }
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('trackPageview', () => {
    it('fires a pageview event via sendBeacon', () => {
      trackPageview('/docs/sdk')
      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/pageview'),
        expect.stringContaining('"path":"/docs/sdk"'),
      )
    })
  })

  describe('trackFunnel', () => {
    it('fires a funnel event via sendBeacon', () => {
      trackFunnel('landing')
      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/funnel'),
        expect.stringContaining('"event":"landing"'),
      )
    })

    it('includes metadata when provided', () => {
      trackFunnel('exporter_view', { platform: 'instagram' })
      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/funnel'),
        expect.stringContaining('"platform":"instagram"'),
      )
    })
  })

  describe('reportError', () => {
    it('fires an error event via sendBeacon', () => {
      reportError('TypeError: x is not defined', { source: 'app.js', line: 42 })
      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/error'),
        expect.stringContaining('"TypeError: x is not defined"'),
      )
    })

    it('includes app and route', () => {
      reportError('test error')
      const body = JSON.parse(navigator.sendBeacon.mock.calls[0][1] as string)
      expect(body.app).toBe('marketing-ui')
      expect(body.route).toBe('/')
    })

    it('truncates long messages', () => {
      reportError('a'.repeat(3000))
      const body = JSON.parse(navigator.sendBeacon.mock.calls[0][1] as string)
      expect(body.message.length).toBeLessThanOrEqual(2000)
    })
  })

  describe('installErrorBeacon', () => {
    it('installs window.onerror handler', () => {
      installErrorBeacon()
      expect(window.onerror).toBeDefined()
    })

    it('reports errors via window.onerror', () => {
      installErrorBeacon()
      const errHandler = window.onerror!
      errHandler('ReferenceError: foo is not defined', 'script.js', 10, 5, new Error('foo is not defined'))
      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/error'),
        expect.stringContaining('foo is not defined'),
      )
    })

    it('installs unhandledrejection handler', async () => {
      installErrorBeacon()
      const err = new Error('unhandled')
      // Create a rejected promise but catch it so vitest doesn't see an unhandled rejection
      const rejected = Promise.reject(err).catch(() => {})
      await new Promise<void>((resolve) => {
        const handler = (e: PromiseRejectionEvent) => {
          window.removeEventListener('unhandledrejection', handler)
          resolve()
        }
        window.addEventListener('unhandledrejection', handler)
        window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
          promise: rejected,
          reason: err,
        }))
      })
      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/error'),
        expect.stringContaining('unhandled'),
      )
    })
  })

  describe('loadGa4', () => {
    let appendChildSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      delete (window as any).dataLayer
      delete (window as any).gtag
      document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove())
      appendChildSpy = vi.spyOn(document.head, 'appendChild')
    })

    afterEach(() => {
      appendChildSpy.mockRestore()
      delete (window as any).dataLayer
      delete (window as any).gtag
    })

    it('is a no-op for an empty measurement ID', () => {
      loadGa4('')
      expect(appendChildSpy).not.toHaveBeenCalled()
      expect((window as any).gtag).toBeUndefined()
    })

    it('loads the GA4 script for the given ID', () => {
      loadGa4('G-MKT123')
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement
      expect(script.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-MKT123')
      expect(script.async).toBe(true)
    })

    it('sets up dataLayer and gtag', () => {
      loadGa4('G-MKT456')
      expect((window as any).gtag).toBeDefined()
      expect(Array.isArray((window as any).dataLayer)).toBe(true)
    })

    it('only installs once (idempotent)', () => {
      loadGa4('G-MKT789')
      loadGa4('G-OTHER')
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('loadHotjar', () => {
    let appendChildSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      delete (window as any).hj
      document.head.querySelectorAll('script[src*="hotjar"]').forEach((s) => s.remove())
      appendChildSpy = vi.spyOn(document.head, 'appendChild')
    })

    afterEach(() => {
      appendChildSpy.mockRestore()
      delete (window as any).hj
    })

    it('is a no-op for a zero site ID', () => {
      loadHotjar(0)
      expect(appendChildSpy).not.toHaveBeenCalled()
      expect((window as any).hj).toBeUndefined()
    })

    it('loads the Hotjar script for the given ID', () => {
      loadHotjar(12345)
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement
      expect(script.src).toBe('https://static.hotjar.com/c/hotjar-12345.js?sv=6')
      expect(script.async).toBe(true)
    })

    it('initialises with full content masking (D56: text blurred, images blocked)', () => {
      loadHotjar(12345)
      expect((window as any).hj.q).toContainEqual(['init', { hjid: 12345, maskAllText: true, blockAllImages: true }])
    })

    it('only installs once (idempotent)', () => {
      loadHotjar(12345)
      loadHotjar(99999)
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('resolveTelemetryIds', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    })

    it('prefers the node config when the node is reachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ga4_measurement_id: 'G-NODE', hotjar_site_id: '777' }),
      }))
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-ENV')
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '555')
      const ids = await resolveTelemetryIds()
      expect(ids).toEqual({ ga4: 'G-NODE', hotjar: 777 })
    })

    it('falls back to env when the node is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-ENV')
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '555')
      const ids = await resolveTelemetryIds()
      expect(ids).toEqual({ ga4: 'G-ENV', hotjar: 555 })
    })

    it('returns empty IDs when neither node nor env configure them', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const ids = await resolveTelemetryIds()
      expect(ids).toEqual({ ga4: '', hotjar: 0 })
    })
  })

  describe('installTelemetry', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      delete (window as any).gtag
      delete (window as any).hj
      delete (window as any).dataLayer
    })

    it('loads both instruments when the node configures them', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ga4_measurement_id: 'G-NODE', hotjar_site_id: '777' }),
      }))
      installTelemetry()
      await new Promise((r) => setTimeout(r, 0))
      expect((window as any).gtag).toBeDefined()
      expect((window as any).hj).toBeDefined()
    })
  })

  describe('hotjarIdentify', () => {
    beforeEach(() => {
      delete (window as any).hj
    })

    afterEach(() => {
      delete (window as any).hj
    })

    it('is a no-op when Hotjar is not installed', () => {
      hotjarIdentify('user-123')
      // No error thrown, silently no-ops
    })

    it('calls hj identify when Hotjar is present', () => {
      const mockHj = vi.fn()
      ;(window as any).hj = mockHj
      hotjarIdentify('user-123', { plan: 'pro' })
      expect(mockHj).toHaveBeenCalledWith('identify', 'user-123', { plan: 'pro' })
    })

    it('calls hj identify without a props arg when no props given', () => {
      const mockHj = vi.fn()
      ;(window as any).hj = mockHj
      hotjarIdentify('user-456')
      expect(mockHj).toHaveBeenCalledWith('identify', 'user-456')
    })
  })
})
