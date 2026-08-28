import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installGa4, installHotjar, trackPageview, hotjarIdentify } from '../lib/analytics'

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
    delete (window as any).dataLayer
    delete (window as any).gtag
    delete (window as any).hj
  })

  describe('installGa4', () => {
    it('is a no-op when VITE_GA4_MEASUREMENT_ID is not set', () => {
      const result = installGa4()
      expect(result).toBeNull()
      expect((window as any).gtag).toBeUndefined()
      expect(appendChildSpy).not.toHaveBeenCalled()
    })

    it('loads the GA4 script when the measurement ID is set', () => {
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-UI123')
      const result = installGa4()
      expect(result).toBe('G-UI123')
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement
      expect(script.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-UI123')
      expect(script.async).toBe(true)
    })

    it('only installs once (idempotent)', () => {
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-UI456')
      installGa4()
      const second = installGa4()
      expect(second).toBeNull()
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('installHotjar', () => {
    it('is a no-op when VITE_HOTJAR_SITE_ID is not set', () => {
      const result = installHotjar()
      expect(result).toBeNull()
      expect((window as any).hj).toBeUndefined()
      expect(appendChildSpy).not.toHaveBeenCalled()
    })

    it('loads the Hotjar script when the site ID is set', () => {
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '654321')
      const result = installHotjar()
      expect(result).toBe(654321)
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement
      expect(script.src).toBe('https://static.hotjar.com/c/hotjar-654321.js?sv=6')
      expect(script.async).toBe(true)
    })

    it('initialises with full content masking (D56: text blurred, images blocked)', () => {
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '654321')
      installHotjar()
      const q = (window as any).hj.q as unknown[][]
      expect(q).toHaveLength(1)
      expect(q[0]).toEqual(['init', { hjid: 654321, maskAllText: true, blockAllImages: true }])
    })
  })

  describe('trackPageview', () => {
    it('sends a page_view event with the given path', () => {
      const mockGtag = vi.fn()
      ;(window as any).gtag = mockGtag
      trackPageview('/?auth=1')
      expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', { page_path: '/?auth=1' })
    })

    it('falls back to the current URL when no path is given', () => {
      const mockGtag = vi.fn()
      ;(window as any).gtag = mockGtag
      trackPageview()
      expect(mockGtag).toHaveBeenCalledWith(
        'event',
        'page_view',
        expect.objectContaining({ page_path: expect.any(String) }),
      )
    })

    it('is a no-op when gtag is not installed', () => {
      delete (window as any).gtag
      expect(() => trackPageview()).not.toThrow()
    })
  })

  describe('hotjarIdentify', () => {
    it('queues an identify call when Hotjar is installed', () => {
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '654321')
      installHotjar()
      hotjarIdentify('bob')
      const q = (window as any).hj.q as unknown[][]
      expect(q[q.length - 1]).toEqual(['identify', 'bob'])
    })

    it('is a no-op when Hotjar is not installed', () => {
      expect(() => hotjarIdentify('bob')).not.toThrow()
    })
  })
})
