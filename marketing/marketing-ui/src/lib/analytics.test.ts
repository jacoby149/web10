import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackPageview, trackFunnel, reportError, installErrorBeacon } from './analytics'

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
})
