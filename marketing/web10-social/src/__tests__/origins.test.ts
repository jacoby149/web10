import { describe, it, expect } from 'vitest';
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
});
