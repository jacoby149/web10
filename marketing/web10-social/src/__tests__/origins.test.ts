import { describe, it, expect, vi, afterEach } from 'vitest';
import { AUTH_ORIGIN, API_ORIGIN, API_HOST, RTC_ORIGIN, RTC_HOST } from '../lib/origins';

// The test env sets no VITE_*_ORIGIN vars, so this pins the production
// fallbacks — a bare build must still target prod (AGENT-OPS.md §4.1).
describe('origins', () => {
  it('falls back to the production origins when no build env is set', () => {
    expect(AUTH_ORIGIN).toBe('https://auth.web10.app');
    expect(API_ORIGIN).toBe('https://api.web10.app');
    expect(RTC_ORIGIN).toBe('https://rtc.web10.app');
  });

  it('derives bare hosts from the origins', () => {
    expect(API_HOST).toBe('api.web10.app');
    expect(RTC_HOST).toBe('rtc.web10.app');
  });

  // The RTC host must track the API host so a local/e2e build (which sets
  // VITE_API_ORIGIN but not VITE_RTC_ORIGIN) targets rtc.localhost, not the
  // prod signaling server. (Regression: the P2P peer was connecting to
  // ws://rtc.web10.app over the local stack → 301 → console error.)
  it('derives the RTC host from the API host when VITE_RTC_ORIGIN is unset', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_ORIGIN', 'http://api.localhost');
    vi.stubEnv('VITE_RTC_ORIGIN', '');
    const local = await import('../lib/origins');
    expect(local.API_HOST).toBe('api.localhost');
    expect(local.RTC_HOST).toBe('rtc.localhost');
    expect(local.RTC_ORIGIN).toBe('http://rtc.localhost');
  });

  it('lets an explicit VITE_RTC_ORIGIN override the derived host', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_ORIGIN', 'http://api.localhost');
    vi.stubEnv('VITE_RTC_ORIGIN', 'https://rtc.example.com');
    const overridden = await import('../lib/origins');
    expect(overridden.RTC_HOST).toBe('rtc.example.com');
    expect(overridden.RTC_ORIGIN).toBe('https://rtc.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
