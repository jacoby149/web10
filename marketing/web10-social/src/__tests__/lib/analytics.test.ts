import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadGa4,
  loadHotjar,
  resolveTelemetryIds,
  installTelemetry,
  trackPageview,
  trackEvent,
  hotjarIdentify,
} from '../../lib/analytics';

describe('analytics', () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (window as any).dataLayer;
    delete (window as any).gtag;
    delete (window as any).hj;
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    document.head.querySelectorAll('script[src*="hotjar"]').forEach((s) => s.remove());
    appendChildSpy = vi.spyOn(document.head, 'appendChild');
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', undefined);
    vi.stubEnv('VITE_HOTJAR_SITE_ID', undefined);
  });

  afterEach(() => {
    appendChildSpy.mockRestore();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as any).dataLayer;
    delete (window as any).gtag;
    delete (window as any).hj;
  });

  describe('loadGa4', () => {
    it('is a no-op for an empty measurement ID', () => {
      loadGa4('');
      expect((window as any).gtag).toBeUndefined();
      expect(appendChildSpy).not.toHaveBeenCalled();
    });

    it('loads the GA4 script for the given ID', () => {
      loadGa4('G-TEST123');
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement;
      expect(script.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123');
      expect(script.async).toBe(true);
    });

    it('sets up dataLayer and gtag', () => {
      loadGa4('G-TEST456');
      expect((window as any).gtag).toBeDefined();
      expect(Array.isArray((window as any).dataLayer)).toBe(true);
    });

    it('only installs once (idempotent)', () => {
      loadGa4('G-TEST789');
      loadGa4('G-OTHER');
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadHotjar', () => {
    it('is a no-op for a zero site ID', () => {
      loadHotjar(0);
      expect((window as any).hj).toBeUndefined();
      expect(appendChildSpy).not.toHaveBeenCalled();
    });

    it('loads the Hotjar script for the given ID', () => {
      loadHotjar(123456);
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement;
      expect(script.src).toBe('https://static.hotjar.com/c/hotjar-123456.js?sv=6');
      expect(script.async).toBe(true);
    });

    it('initialises with full content masking (D56: text blurred, images blocked)', () => {
      loadHotjar(123456);
      const q = (window as any).hj.q as unknown[][];
      expect(q).toHaveLength(1);
      expect(q[0]).toEqual(['init', { hjid: 123456, maskAllText: true, blockAllImages: true }]);
    });

    it('only installs once (idempotent)', () => {
      loadHotjar(123456);
      loadHotjar(999999);
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveTelemetryIds', () => {
    it('prefers the node config when the node is reachable', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ga4_measurement_id: 'G-NODE', hotjar_site_id: '777' }),
      });
      vi.stubGlobal('fetch', fetchMock);
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-ENV');
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '555');
      const ids = await resolveTelemetryIds();
      expect(ids).toEqual({ ga4: 'G-NODE', hotjar: 777 });
    });

    it('falls back to env when the node is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-ENV');
      vi.stubEnv('VITE_HOTJAR_SITE_ID', '555');
      const ids = await resolveTelemetryIds();
      expect(ids).toEqual({ ga4: 'G-ENV', hotjar: 555 });
    });

    it('falls back to env when the node returns an error status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-ENV');
      vi.stubEnv('VITE_HOTJAR_SITE_ID', undefined);
      const ids = await resolveTelemetryIds();
      expect(ids).toEqual({ ga4: 'G-ENV', hotjar: 0 });
    });

    it('returns empty IDs when neither node nor env configure them', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      const ids = await resolveTelemetryIds();
      expect(ids).toEqual({ ga4: '', hotjar: 0 });
    });
  });

  describe('installTelemetry', () => {
    it('loads both instruments when the node configures them', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ga4_measurement_id: 'G-NODE', hotjar_site_id: '777' }),
        }),
      );
      installTelemetry();
      await new Promise((r) => setTimeout(r, 0));
      expect((window as any).gtag).toBeDefined();
      expect((window as any).hj).toBeDefined();
    });

    it('loads nothing when the node configures neither', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ga4_measurement_id: '', hotjar_site_id: '' }),
        }),
      );
      installTelemetry();
      await new Promise((r) => setTimeout(r, 0));
      expect((window as any).gtag).toBeUndefined();
      expect((window as any).hj).toBeUndefined();
    });
  });

  describe('trackPageview', () => {
    it('sends a page_view event with page_path', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      trackPageview('/feed');
      expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', { page_path: '/feed' });
    });

    it('is a no-op when gtag is not installed', () => {
      delete (window as any).gtag;
      expect(() => trackPageview('/discover')).not.toThrow();
    });
  });

  describe('trackEvent', () => {
    it('sends a login event', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      trackEvent('login');
      expect(mockGtag).toHaveBeenCalledWith('event', 'login', {});
    });

    it('is a no-op when gtag is not installed', () => {
      delete (window as any).gtag;
      expect(() => trackEvent('login')).not.toThrow();
    });
  });

  describe('hotjarIdentify', () => {
    it('queues an identify call when Hotjar is installed', () => {
      loadHotjar(123456);
      hotjarIdentify('alice', { plan: 'pro' });
      const q = (window as any).hj.q as unknown[][];
      expect(q[q.length - 1]).toEqual(['identify', 'alice', { plan: 'pro' }]);
    });

    it('is a no-op when Hotjar is not installed', () => {
      expect(() => hotjarIdentify('alice')).not.toThrow();
    });
  });
});