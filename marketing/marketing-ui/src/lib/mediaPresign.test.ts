import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  deriveObjectKey,
  fetchMediaList,
  resolveMediaRef,
  getPublicMediaReadUrl,
  getPublicMediaUrl,
  getPublicMediaThumbnailUrl,
  clearMediaCache,
} from '@/lib/mediaPresign';

const API_ORIGIN = 'https://api.web10.app';

const jsonOk = (body: unknown) => ({
  ok: true,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  clearMediaCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deriveObjectKey', () => {
  it('strips bucket from path-style S3 URL', () => {
    expect(deriveObjectKey('https://minio.web10.app/web10-media/alice/abc/pic.png')).toBe(
      'alice/abc/pic.png',
    );
  });

  it('handles vhost-style or bare key', () => {
    expect(deriveObjectKey('alice/abc/pic.png')).toBe('alice/abc/pic.png');
  });

  it('strips query params from presigned URL', () => {
    expect(deriveObjectKey('https://minio.app/bucket/alice/k/p.png?X-Amz-Signature=sig')).toBe(
      'alice/k/p.png',
    );
  });
});

describe('fetchMediaList', () => {
  it('fetches media list for an author', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonOk([
        { _id: 'm1', url: 'https://s3/a.png', object_key: 'alice/abc/a.png', mime_type: 'image/png' },
      ]) as unknown as Response,
    );
    const records = await fetchMediaList('alice');
    expect(records).toHaveLength(1);
    expect(records[0]._id).toBe('m1');
    expect(fetch).toHaveBeenCalledWith(
      `${API_ORIGIN}/media/alice/list`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ service: 'public_media' }),
      }),
    );
  });

  it('caches the media list and skips re-fetch within TTL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonOk([{ _id: 'm1', url: 'https://s3/a.png' }]) as unknown as Response,
    );
    await fetchMediaList('alice');
    await fetchMediaList('alice');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty array on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as unknown as Response);
    expect(await fetchMediaList('nobody')).toEqual([]);
  });
});

describe('resolveMediaRef', () => {
  it('finds a media record by _id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonOk([
        { _id: 'm1', url: 'https://s3/a.png', object_key: 'alice/abc/a.png' },
        { _id: 'm2', url: 'https://s3/b.png', object_key: 'alice/abc/b.png' },
      ]) as unknown as Response,
    );
    const record = await resolveMediaRef('alice', 'm2');
    expect(record?._id).toBe('m2');
  });

  it('returns null when ref not found', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonOk([{ _id: 'm1', url: 'https://s3/a.png' }]) as unknown as Response,
    );
    expect(await resolveMediaRef('alice', 'missing')).toBeNull();
  });
});

describe('getPublicMediaReadUrl', () => {
  it('presigns a URL for a public_media object', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonOk({ read_url: 'https://signed?sig=abc', expires_in: 300 }) as unknown as Response,
    );
    const url = await getPublicMediaReadUrl('alice', 'alice/abc/a.png');
    expect(url).toBe('https://signed?sig=abc');
    expect(fetch).toHaveBeenCalledWith(
      `${API_ORIGIN}/media/alice/read`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          object_key: 'alice/abc/a.png',
          service: 'public_media',
        }),
      }),
    );
  });

  it('caches the read URL and skips re-fetch while fresh', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonOk({ read_url: 'https://signed?sig=abc', expires_in: 300 }) as unknown as Response,
    );
    await getPublicMediaReadUrl('alice', 'alice/abc/a.png');
    await getPublicMediaReadUrl('alice', 'alice/abc/a.png');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('throws on non-ok presign', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as unknown as Response);
    await expect(getPublicMediaReadUrl('alice', 'alice/abc/a.png')).rejects.toThrow(
      'presign failed: 401',
    );
  });
});

describe('getPublicMediaUrl', () => {
  it('resolves a media ref to a presigned URL', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonOk([
          { _id: 'm1', url: 'https://s3/a.png', object_key: 'alice/abc/a.png' },
        ]) as unknown as Response,
      )
      .mockResolvedValueOnce(
        jsonOk({ read_url: 'https://signed?sig=abc', expires_in: 300 }) as unknown as Response,
      );
    const url = await getPublicMediaUrl('alice', 'm1');
    expect(url).toBe('https://signed?sig=abc');
  });

  it('returns null when media ref not found', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonOk([{ _id: 'm2', url: 'https://s3/b.png' }]) as unknown as Response,
    );
    expect(await getPublicMediaUrl('alice', 'missing')).toBeNull();
  });

  it('returns null when presign fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonOk([
          { _id: 'm1', url: 'https://s3/a.png', object_key: 'alice/abc/a.png' },
        ]) as unknown as Response,
      )
      .mockResolvedValueOnce({ ok: false, status: 401 } as unknown as Response);
    expect(await getPublicMediaUrl('alice', 'm1')).toBeNull();
  });
});

describe('getPublicMediaThumbnailUrl', () => {
  it('presigns a separate thumbnail when one exists', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonOk({ read_url: 'https://signed-thumb', expires_in: 300 }) as unknown as Response,
      );
    const url = await getPublicMediaThumbnailUrl('alice', {
      _id: 'm1',
      url: 'https://s3/a.png',
      thumbnail_url: 'https://s3/a-thumb.png',
    });
    expect(url).toBe('https://signed-thumb');
  });

  it('falls back to main URL when thumbnail equals main URL', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonOk([
          { _id: 'm1', url: 'https://s3/a.png', object_key: 'alice/abc/a.png' },
        ]) as unknown as Response,
      )
      .mockResolvedValueOnce(
        jsonOk({ read_url: 'https://signed-main', expires_in: 300 }) as unknown as Response,
      );
    const url = await getPublicMediaThumbnailUrl('alice', {
      _id: 'm1',
      url: 'https://s3/a.png',
      thumbnail_url: 'https://s3/a.png',
    });
    expect(url).toBe('https://signed-main');
  });
});
