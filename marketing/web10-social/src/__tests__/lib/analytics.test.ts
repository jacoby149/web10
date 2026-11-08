import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackNodePageview, reportNodeError, trackEvent } from '../../lib/analytics';

afterEach(() => vi.unstubAllGlobals());
describe('social operational telemetry', () => {
  it('preserves the first-party diagnostic path', () => {
    const calls: Array<[string, string]> = [];
    const sendBeacon = vi.fn((...args: [string, string]) => { calls.push(args); return true; });
    vi.stubGlobal('navigator', { sendBeacon, userAgent: 'synthetic' });
    trackNodePageview('/feed'); reportNodeError('synthetic');
    expect(calls.map((c) => JSON.parse(c[1]).type)).toEqual(['pageview', 'error']);
  });
  it('contains blocked beacons and safely ignores unconfigured product tracking', () => {
    vi.stubGlobal('navigator', { sendBeacon: () => { throw new Error('blocked'); } });
    expect(() => trackNodePageview('/feed')).not.toThrow();
    expect(() => trackEvent('follow')).not.toThrow();
  });
});
