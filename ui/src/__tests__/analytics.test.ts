import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  loadGa4,
  loadHotjar,
  resolveTelemetryIds,
  installTelemetry,
  trackPageview,
  hotjarIdentify,
} from '../lib/analytics'

describe('analytics (ui)', () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    delete (window as any).dataLayer
    delete (window as any).gtag
    delete (window as any).hj
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove())
    document.head.querySelectorAll('script[src*="hotjar"]').forEach((s) => s.remove())
    appendChildSpy = vi.spyOn(document.head, 'appendChild')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', undefined)
    vi.stubEnv('VITE_HOTJAR_SITE_ID', undefined)
  })

  afterEach(() => {
    appendChildSpy.mockRestore()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (window as any).dataLayer
    delete (window as any).gtag
    delete (window as any).hj
  })

  describe('loadGa4', () => {
    it('is a no-op for an empty measurement ID', () => {
      loadGa4('')
      expect((window as any).gtag).toBeUndefined()
      expect(appendChildSpy).not.toHaveBeenCalled()
    })

    it('loads the GA4 script for the given ID', () => {
      loadGa4('G-UI123')
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement
      expect(script.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-UI123')
      expect(script.async).toBe(true)
    })

    it('only installs once (idempotent)', () => {
      loadGa4('G-UI456')
      loadGa4('G-OTHER')
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('loadHotjar', () => {
    it('is a no-op for a zero site ID', () => {
      loadHotjar(0)
      expect((window as any).hj).toBeUndefined()
      expect(appendChildSpy).not.toHaveBeenCalled()
    })

    it('loads the Hotjar script for the given ID', () => {
      loadHotjar(654321)
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement
      expect(script.src).toBe('https://static.hotjar.com/c/hotjar-654321.js?sv=6')
      expect(script.async).toBe(true)
    })

    it('initialises with full content masking (D56: text blurred, images blocked)', () => {
      loadHotjar(654321)
      const q = (window as any).hj.q as unknown[][]
      expect(q).toHaveLength(1)
      expect(q[0]).toEqual(['init', { hjid: 654321, maskAllText: true, blockAllImages: true }])
    })
  })

  describe('resolveTelemetryIds', () => {
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
  })

  describe('installTelemetry', () => {
    it('loads both instruments when the node configures them', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ga4_measurement_id: 'G-NODE', hotjar_site_id: '777' }),
      }))
      await installTelemetry()
      expect((window as any).gtag).toBeDefined()
      expect((window as any).hj).toBeDefined()
    })
  })

  describe('trackPageview', () => {
    it('sends a page_view event with the given path', () => {
      const mockGtag = vi.fn()
      ;(window as any).gtag = mockGtag
      trackPageview('/?auth=1')
      expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', { page_path: '/?auth=1' })
    })

    it('is a no-op when gtag is not installed', () => {
      delete (window as any).gtag
      expect(() => trackPageview()).not.toThrow()
    })
  })

  describe('hotjarIdentify', () => {
    it('queues an identify call when Hotjar is installed', () => {
      loadHotjar(654321)
      hotjarIdentify('bob')
      const q = (window as any).hj.q as unknown[][]
      expect(q[q.length - 1]).toEqual(['identify', 'bob'])
    })

    it('is a no-op when Hotjar is not installed', () => {
      expect(() => hotjarIdentify('bob')).not.toThrow()
    })
  })
})