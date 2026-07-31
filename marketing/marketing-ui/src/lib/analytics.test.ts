import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackPageview, trackFunnel, reportError, installErrorBeacon, installHotjar, hotjarIdentify } from './analytics'

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

  describe('installHotjar', () => {
    let appendChildSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      delete (window as any).hj
      delete (window as any).hjs
      appendChildSpy = vi.spyOn(document.head, 'appendChild')
      // Clear env before each test
      vi.stubEnv('VITE_HOTJAR_SITE_ID', undefined)
      vi.stubEnv('VITE_HOTJAR_VERSION', undefined)
    })

    afterEach(() => {
      appendChildSpy.mockRestore()
      vi.unstubAllEnvs()
    })

    it('is a no-op when VITE_HOTJAR_SITE_ID is not set', () => {
      installHotjar()
      expect(appendChildSpy).not.toHaveBeenCalled()
      expect((window as any).hj).toBeUndefined()
    })

    it('loads the Hotjar script when site ID is set', () => {
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '12345')
      installHotjar()
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement
      expect(script.src).toBe('https://script.hotjar.com/12345.js')
      expect(script.async).toBe(true)
    })

    it('initialises Hotjar with site ID and default version', () => {
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '12345')
      installHotjar()
      expect((window as any).hjs).toContainEqual(['initialize', 12345, 1])
    })

    it('uses VITE_HOTJAR_VERSION when provided', () => {
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '12345')
      vi.stubEnv('VITE_HOTJAR_VERSION', '3')
      installHotjar()
      expect((window as any).hjs).toContainEqual(['initialize', 12345, 3])
    })

    it('sets up the hjs queue array', () => {
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '12345')
      installHotjar()
      expect(Array.isArray((window as any).hjs)).toBe(true)
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

    it('calls hj identify with minimal args when no props given', () => {
      const mockHj = vi.fn()
      ;(window as any).hj = mockHj
      hotjarIdentify('user-456')
      expect(mockHj).toHaveBeenCalledWith('identify', 'user-456', undefined)
    })
  })
})
