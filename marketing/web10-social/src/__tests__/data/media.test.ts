import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { uploadMedia, refreshMediaUrls, refreshMediaUrl, resolveMediaRefs } from '../../data/posts';

// A tiny valid 1x1 PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8D4HwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

function mockV3Client(overrides: Record<string, unknown> = {}) {
  const mock = {
    isSignedIn: vi.fn(() => true),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    requestMediaUploadUrl: vi.fn().mockImplementation(async (params: { filename: string }) => ({
      upload_url: 'https://minio.example.com/bucket',
      fields: { key: `alice/${params.filename}`, 'Content-Type': 'image/png' },
      object_key: `alice/${params.filename}`,
      content_type: 'image/png',
    })),
    confirmMediaUpload: vi.fn().mockImplementation(async (metadata: Record<string, unknown>) => ({
      doc_id: 'media-1',
      author_key: 'alice',
      service: 'media_metadata',
      body: metadata,
      ref_value: '',
      tags: [],
      created_at: '2026-08-29T00:00:00',
      updated_at: '2026-08-29T00:00:00',
    })),
    listMedia: vi.fn().mockResolvedValue([]),
    getMediaReadUrl: vi.fn().mockImplementation(async (key: string) => ({
      read_url: `https://minio.example.com/signed/${key}?sig=abc`,
      expires_in: 3600,
    })),
    ...overrides,
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

function pngFile(name = 'a.png') {
  return new File([TINY_PNG], name, { type: 'image/png' });
}

describe('media data layer (v3) — the real functions', () => {
  let mock: ReturnType<typeof mockV3Client>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mock = mockV3Client();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('uploadMedia — the presigned flow', () => {
    it('requests a presigned form, uploads the file, confirms with the object_key', async () => {
      const record = await uploadMedia({ file: pngFile(), service: 'public_media' });

      expect(mock.requestMediaUploadUrl).toHaveBeenCalledWith({
        filename: 'a.png',
        mimeType: 'image/png',
        sizeBytes: TINY_PNG.length,
      });
      // The file was POSTed to the presigned URL
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://minio.example.com/bucket');
      expect(init.method).toBe('POST');
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).get('key')).toBe('alice/a.png');
      expect((init.body as FormData).get('file')).toBeInstanceOf(File);
      // The confirm carries the object_key (never a URL) + the service
      expect(mock.confirmMediaUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          object_key: 'alice/a.png',
          filename: 'a.png',
          mime_type: 'image/png',
          size_bytes: TINY_PNG.length,
          service: 'public_media',
        }),
      );
      // The returned record is mapped from the document envelope
      expect(record._id).toBe('media-1');
      expect(record.object_key).toBe('alice/a.png');
      expect(record.mime_type).toBe('image/png');
    });

    it('throws when the object storage upload fails', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
      await expect(uploadMedia({ file: pngFile() })).rejects.toThrow('Media upload failed: 400');
      // No confirm after a failed upload
      expect(mock.confirmMediaUpload).not.toHaveBeenCalled();
    });

    it('uploads the thumbnail first and stores its object_key', async () => {
      const thumbFile = pngFile('thumb.webp');
      const record = await uploadMedia({ file: pngFile(), thumbnailFile: thumbFile, service: 'media' });
      // Two uploads: thumbnail, then the main file
      expect(mock.requestMediaUploadUrl).toHaveBeenCalledTimes(2);
      expect(mock.requestMediaUploadUrl.mock.calls[0][0].filename).toBe('thumb.webp');
      expect(mock.requestMediaUploadUrl.mock.calls[1][0].filename).toBe('a.png');
      expect(mock.confirmMediaUpload).toHaveBeenCalledTimes(2);
      // The parent metadata carries the thumbnail's object_key
      const parentCall = mock.confirmMediaUpload.mock.calls[1][0] as Record<string, unknown>;
      expect(parentCall.thumbnail_object_key).toBe('alice/thumb.webp');
      expect(record.thumbnail_object_key).toBe('alice/thumb.webp');
    });
  });

  describe('refreshMediaUrls — fresh presigned reads', () => {
    it('presigns the url from the object_key', async () => {
      const record = { _id: 'm1', url: '', object_key: 'alice/a.png', created_at: 'x' };
      const [refreshed] = await refreshMediaUrls([record]);
      expect(mock.getMediaReadUrl).toHaveBeenCalledWith('alice/a.png');
      expect(refreshed.url).toBe('https://minio.example.com/signed/alice/a.png?sig=abc');
    });

    it('presigns the thumbnail too', async () => {
      const record = {
        _id: 'm1',
        url: '',
        object_key: 'alice/a.png',
        thumbnail_object_key: 'alice/thumb.webp',
        created_at: 'x',
      };
      const [refreshed] = await refreshMediaUrls([record]);
      expect(refreshed.url).toBe('https://minio.example.com/signed/alice/a.png?sig=abc');
      expect(refreshed.thumbnail_url).toBe('https://minio.example.com/signed/alice/thumb.webp?sig=abc');
    });

    it('returns records without an object_key unchanged (legacy)', async () => {
      const record = { _id: 'm1', url: 'http://stored', created_at: 'x' };
      const [refreshed] = await refreshMediaUrls([record]);
      expect(mock.getMediaReadUrl).not.toHaveBeenCalled();
      expect(refreshed).toBe(record);
    });

    it('degrades to the original record when presigning fails', async () => {
      mock.getMediaReadUrl.mockRejectedValueOnce(new Error('nope'));
      const record = { _id: 'm1', url: '', object_key: 'alice/a.png', created_at: 'x' };
      const refreshed = await refreshMediaUrl(record);
      expect(refreshed).toBe(record);
    });
  });

  describe('resolveMediaRefs — dual-shape refs', () => {
    it('resolves string refs via listMedia(doc_ids) + presign', async () => {
      mock.listMedia.mockResolvedValueOnce([
        {
          doc_id: 'm1',
          author_key: 'alice',
          service: 'media_metadata',
          body: { object_key: 'alice/a.png', mime_type: 'image/png', filename: 'a.png' },
          ref_value: '',
          tags: [],
          created_at: '2026-08-29T00:00:00',
          updated_at: '2026-08-29T00:00:00',
        },
      ]);
      const records = await resolveMediaRefs(['m1']);
      // The exact-ref filter is sent (a bare latest-N list misses older refs)
      expect(mock.listMedia).toHaveBeenCalledWith({ limit: 1, doc_ids: ['m1'] });
      expect(mock.getMediaReadUrl).toHaveBeenCalledWith('alice/a.png');
      expect(records).toHaveLength(1);
      expect(records[0]._id).toBe('m1');
      expect(records[0].url).toBe('https://minio.example.com/signed/alice/a.png?sig=abc');
    });

    it('maps API-resolved object refs directly (the cross-user path)', async () => {
      const records = await resolveMediaRefs([
        {
          doc_id: 'm2',
          object_key: 'bob/b.png',
          mime_type: 'image/png',
          filename: 'b.png',
          size_bytes: 68,
          read_url: 'https://minio.example.com/signed/bob/b.png?sig=fresh',
        },
      ]);
      // No listMedia for resolved refs (listMedia is owner-scoped — the
      // resolved read_url IS the cross-user media path)
      expect(mock.listMedia).not.toHaveBeenCalled();
      expect(records).toHaveLength(1);
      expect(records[0]._id).toBe('m2');
      expect(records[0].url).toBe('https://minio.example.com/signed/bob/b.png?sig=fresh');
      expect(records[0].mime_type).toBe('image/png');
      expect(records[0].size_bytes).toBe(68);
    });

    it('handles mixed refs (resolved objects + string doc_ids)', async () => {
      mock.listMedia.mockResolvedValueOnce([
        {
          doc_id: 'm1',
          author_key: 'alice',
          service: 'media_metadata',
          body: { object_key: 'alice/a.png', mime_type: 'image/png' },
          ref_value: '',
          tags: [],
          created_at: '2026-08-29T00:00:00',
          updated_at: '2026-08-29T00:00:00',
        },
      ]);
      const records = await resolveMediaRefs([
        { doc_id: 'm2', object_key: 'bob/b.png', read_url: 'http://signed/b' },
        'm1',
      ]);
      expect(records).toHaveLength(2);
      expect(records.map((r) => r._id).sort()).toEqual(['m1', 'm2']);
    });

    it('returns [] for empty refs', async () => {
      await expect(resolveMediaRefs([])).resolves.toEqual([]);
      expect(mock.listMedia).not.toHaveBeenCalled();
    });
  });
});