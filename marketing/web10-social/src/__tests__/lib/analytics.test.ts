import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installGa4, trackPageview, trackEvent } from '../../lib/analytics';

describe('analytics', () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (window as any).dataLayer;
    delete (window as any).gtag;
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    appendChildSpy = vi.spyOn(document.head, 'appendChild');
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', undefined);
  });

  afterEach(() => {
    appendChildSpy.mockRestore();
    vi.unstubAllEnvs();
    delete (window as any).dataLayer;
    delete (window as any).gtag;
  });

  describe('installGa4', () => {
    it('is a no-op when VITE_GA4_MEASUREMENT_ID is not set', () => {
      const result = installGa4();
      expect(result).toBeNull();
      expect((window as any).gtag).toBeUndefined();
      expect(appendChildSpy).not.toHaveBeenCalled();
    });

    it('is a no-op for empty measurement ID', () => {
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', '');
      const result = installGa4();
      expect(result).toBeNull();
    });

    it('is a no-op for whitespace-only measurement ID', () => {
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', '   ');
      const result = installGa4();
      expect(result).toBeNull();
    });

    it('loads the GA4 script when measurement ID is set', () => {
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123');
      const result = installGa4();
      expect(result).toBe('G-TEST123');
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
      const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement;
      expect(script.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123');
      expect(script.async).toBe(true);
    });

    it('sets up dataLayer and gtag', () => {
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST456');
      installGa4();
      expect((window as any).gtag).toBeDefined();
      expect(Array.isArray((window as any).dataLayer)).toBe(true);
    });

    it('only installs once (idempotent)', () => {
      vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST789');
      installGa4();
      // Second call sees window.gtag already set → no-op
      const second = installGa4();
      expect(second).toBeNull();
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
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

    it('sends a logout event', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      trackEvent('logout');
      expect(mockGtag).toHaveBeenCalledWith('event', 'logout', {});
    });

    it('sends a post_created event', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      trackEvent('post_created');
      expect(mockGtag).toHaveBeenCalledWith('event', 'post_created', {});
    });

    it('sends a follow event', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      trackEvent('follow');
      expect(mockGtag).toHaveBeenCalledWith('event', 'follow', {});
    });

    it('sends an unfollow event', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      trackEvent('unfollow');
      expect(mockGtag).toHaveBeenCalledWith('event', 'unfollow', {});
    });

    it('sends post_created with visibility param', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      trackEvent('post_created', { visibility: 'public' });
      expect(mockGtag).toHaveBeenCalledWith('event', 'post_created', { visibility: 'public' });
    });

    it('is a no-op when gtag is not installed', () => {
      delete (window as any).gtag;
      expect(() => trackEvent('login')).not.toThrow();
    });
  });
});