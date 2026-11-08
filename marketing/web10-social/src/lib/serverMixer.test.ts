import { describe, expect, it } from 'vitest';
import { allocateServerFetches, encodeServerMixer, parseServerMixer, sanitizeServerWeights } from './serverMixer';

const servers = ['https://a.example', 'https://b.example', 'https://c.example'];

describe('server mixer budgets', () => {
  it('allocates by destination, deduplicates nodes and preserves a total page budget', () => {
    expect(allocateServerFetches([...servers, servers[0]], {})).toEqual([
      { origin: servers[0], weight: 100, count: 7 },
      { origin: servers[1], weight: 100, count: 7 },
      { origin: servers[2], weight: 100, count: 6 },
    ]);
  });
  it('uses relative weights, mutes without deletion and intentionally supports all-paused', () => {
    const weights = { [servers[0]]: 100, [servers[1]]: 50, [servers[2]]: 0 };
    expect(allocateServerFetches(servers, weights, 12).map(row => row.count)).toEqual([8, 4, 0]);
    expect(allocateServerFetches(servers, Object.fromEntries(servers.map(origin => [origin, 0]))).map(row => row.count)).toEqual([0, 0, 0]);
  });
  it('rotates tied small allocations across pages', () => {
    expect([0, 1, 2].map(page => allocateServerFetches(servers, {}, 1, page).find(row => row.count)!.origin)).toEqual(servers);
  });
  it('keeps URL input from adding destinations or smuggling authority', () => {
    const raw = { [servers[0]]: 0, 'https://unsubscribed.example': 100, token: 'not-authority' };
    expect(parseServerMixer(JSON.stringify(raw), servers)).toEqual({ [servers[0]]: 0 });
    expect(encodeServerMixer(raw, servers)).toBe(JSON.stringify({ [servers[0]]: 0 }));
    expect(parseServerMixer(null, servers)).toBeNull();
    expect(parseServerMixer('invalid', servers)).toEqual({});
    expect(parseServerMixer('x'.repeat(8193), servers)).toEqual({});
  });
  it.each([-1, 101, 0.5, '50', null, Infinity])('discards malformed saved weight %s', weight => {
    expect(sanitizeServerWeights({ [servers[0]]: weight }, servers)).toEqual({});
  });
  it('bounds budgets and refuses origins with paths, credentials or non-HTTPS schemes', () => {
    for (const origin of ['http://a.example', 'https://a.example/path', 'https://u:p@a.example']) {
      expect(() => allocateServerFetches([origin], {})).toThrow();
    }
    for (const budget of [-1, 1001, 1.5, NaN]) expect(() => allocateServerFetches(servers, {}, budget)).toThrow();
    expect(allocateServerFetches([], {})).toEqual([]);
  });
});
