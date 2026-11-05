import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindMediaRead, invalidateMediaRecovery, mapMediaReads, mediaExpiry, recoverMediaUrl, withMediaRecovery } from '@web10/discover/media-recovery';

const url = (key: string, token = 'old') => `https://media.example/media/${key}?cap=${token}`;
const response = (a = url('a'), b = url('b')) => ({ body: { media_refs: [{ read_url: a, thumbnail_url: b }] } });
beforeEach(() => invalidateMediaRecovery());

describe('authorized media recovery', () => {
  it.each([1, 10, 100])('bounds %i optional People enrichments to six while preserving all results/order', async count => {
    let active = 0, peak = 0;
    const input = Array.from({ length: count }, (_, i) => i);
    const result = await mapMediaReads(input, async value => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 0));
      active--; return value * 2;
    });
    expect(peak).toBe(Math.min(6, count));
    expect(result).toEqual(input.map(value => value * 2));
  });
  it('shares a single original read across image/audio siblings and repeated occurrences', async () => {
    const replay = vi.fn(async () => response(url('a', 'fresh'), url('b', 'fresh')));
    bindMediaRead(response(), replay, () => true);
    const values = await Promise.all([recoverMediaUrl(url('a')), recoverMediaUrl(url('b')), recoverMediaUrl(url('a'))]);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(values.map(v => v.url)).toEqual([url('a', 'fresh'), url('b', 'fresh'), url('a', 'fresh')]);
  });
  it('does not substitute another owner or retained sibling for missing/revoked media', async () => {
    bindMediaRead(response(), async () => response(url('foreign', 'fresh'), url('b', 'fresh')), () => true);
    await expect(recoverMediaUrl(url('a'))).rejects.toThrow('no longer readable');
  });
  it('rejects obsolete credentials before and after a pending read, including same-token relogin', async () => {
    let finish!: (v: unknown) => void;
    const replay = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    bindMediaRead(response(), replay, () => true);
    const pending = recoverMediaUrl(url('a'));
    invalidateMediaRecovery();
    finish(response(url('a', 'fresh')));
    await expect(pending).rejects.toThrow('reader changed');
    await expect(recoverMediaUrl(url('a'))).rejects.toThrow('no longer current');
  });
  it('fences SDK signOut even if a later handoff returns identical token bytes', async () => {
    const client = withMediaRecovery({ read: async () => response(), signOut: vi.fn() }, () => 'same-token');
    await client.read();
    client.signOut();
    await expect(recoverMediaUrl(url('a'))).rejects.toThrow('no longer current');
  });
  it('binds a snapshot of read scope, never repeats writes or view accounting', async () => {
    let token = 'one';
    const read = vi.fn(async (_service: string, _options: { groups: string[]; surface?: string }) => response(url('a', 'fresh')));
    const create = vi.fn(async () => response());
    const client = withMediaRecovery({ read, create }, () => token);
    const options = { groups: ['original'], surface: 'video' };
    await client.read('posts', options);
    options.groups[0] = 'changed';
    await recoverMediaUrl(url('a', 'fresh'));
    expect(read.mock.calls[1]).toEqual(['posts', { groups: ['original'] }]);
    await client.create();
    expect(create).toHaveBeenCalledTimes(1);
    token = 'two';
    await expect(recoverMediaUrl(url('a', 'fresh'))).rejects.toThrow('no longer current');
  });
  it('bounds recovery reads to four with no work for stale queued scopes', async () => {
    let running = 0, peak = 0;
    const releases: (() => void)[] = [];
    const pending = Array.from({ length: 10 }, (_, i) => {
      const original = url(String(i));
      bindMediaRead({ url: original }, async () => {
        running++; peak = Math.max(peak, running);
        await new Promise<void>(resolve => releases.push(resolve));
        running--; return { url: url(String(i), 'fresh') };
      }, () => true);
      return recoverMediaUrl(original);
    });
    expect(peak).toBe(4);
    while (releases.length || running) {
      releases.splice(0).forEach(resolve => resolve());
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await Promise.all(pending);
    expect(peak).toBe(4);
  });
  it('reads unsigned expiry only as a scheduling hint', () => {
    const token = `x.${btoa(JSON.stringify({ exp: 123 }))}.x`;
    expect(mediaExpiry(url('a', token))).toBe(123000);
    expect(mediaExpiry(url('a'))).toBe(Infinity);
  });
  it('settles stalled UI demand within 15 seconds without releasing live request slots or draining stale queued work', async () => {
    vi.useFakeTimers();
    const releases: (() => void)[] = [];
    const replay = vi.fn(() => new Promise<void>(resolve => releases.push(resolve)));
    const pending = Array.from({ length: 10 }, (_, i) => {
      const original = url(`stalled-${i}`);
      bindMediaRead({ url: original }, replay, () => true);
      return recoverMediaUrl(original);
    });
    const settled = Promise.allSettled(pending);
    expect(replay).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await settled).every(value => value.status === 'rejected')).toBe(true);
    releases.forEach(resolve => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(replay).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});
