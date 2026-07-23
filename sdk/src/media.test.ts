import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks (must run before any import that uses fetch) ─────────────
const mocks = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))

vi.stubGlobal('fetch', mocks.mockFetch)

import { createClient, type Web10Client } from './client'
import type {
  MediaUploadUrlResponse,
  MediaReadUrlResponse,
  MediaRecord,
} from './types'

const { mockFetch } = mocks

// ── Helpers ────────────────────────────────────────────────────────────────

function makeJwt(payload: Record<string, unknown>): string {
  const h = btoa(JSON.stringify(payload))
  return `header.${h}.sig`
}

function ok(json: unknown): { ok: true; json: () => Promise<unknown> } {
  return { ok: true, json: async () => json }
}

function okText(text: string): { ok: true; text: () => Promise<string> } {
  return { ok: true, text: async () => text }
}

const PAYLOAD = { username: 'alice', provider: 'api.example.com' }
const JWT = makeJwt(PAYLOAD)

class FakeBlob extends Blob {
  name: string
  constructor(parts: BlobPart[], opts: BlobPropertyBag & { name?: string } = {}) {
    super(parts, opts)
    this.name = opts.name ?? 'blob.bin'
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  Object.defineProperty(window, 'location', {
    value: { href: 'http://localhost:3000/', protocol: 'http:', hostname: 'localhost' },
    writable: true,
    configurable: true,
  })
  // Clear any leftover token cookie so the "throws without auth" tests
  // don't inherit a token from a sibling test's setToken.
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/;')
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('media requestUploadUrl', () => {
  it('POSTs /{user}/upload with snake_case body matching the api', async () => {
    const response: MediaUploadUrlResponse = {
      upload_url: 'https://s3.example.com/web10-media',
      fields: { key: 'alice/x.png', Policy: '...', 'X-Amz-Signature': '...' },
      object_key: 'alice/abc/x.png',
      content_type: 'image/png',
    }
    mockFetch.mockResolvedValueOnce(ok(response))

    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    const result = await w.requestUploadUrl({ filename: 'x.png', mimeType: 'image/png', sizeBytes: 123 })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.web10.app/alice/upload',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body).toEqual({
      token: JWT,
      filename: 'x.png',
      mime_type: 'image/png',
      size_bytes: 123,
    })
    expect(result).toEqual(response)
  })

  it('nulls optional fields when omitted (api requires the keys to exist on the model)', async () => {
    mockFetch.mockResolvedValueOnce(ok({ upload_url: 'u', fields: {}, object_key: 'k', content_type: 'application/octet-stream' }))
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    await w.requestUploadUrl({ filename: 'y.bin' })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.mime_type).toBeNull()
    expect(body.size_bytes).toBeNull()
  })

  it('routes to an explicit provider node when addressing another user', async () => {
    mockFetch.mockResolvedValueOnce(ok({ upload_url: 'u', fields: {}, object_key: 'k', content_type: 'application/octet-stream' }))
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    await w.requestUploadUrl({ filename: 'x' }, 'bob', 'api.othernode.com')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.othernode.com/bob/upload',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws without auth', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(() => w.requestUploadUrl({ filename: 'x' })).toThrow()
  })
})

describe('media confirmUpload', () => {
  it('POSTs /{user}/upload/confirm with snake_case body', async () => {
    const record: MediaRecord = {
      _id: 'abc',
      url: 'https://s3.example.com/web10-media/alice/x.png',
      filename: 'x.png',
      created_at: '2026-07-23T00:00:00',
      mime_type: 'image/png',
      size_bytes: 123,
      encrypted: false,
    }
    mockFetch.mockResolvedValueOnce(ok(record))

    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    const result = await w.confirmUpload({
      url: 'https://s3.example.com/web10-media',
      filename: 'x.png',
      mimeType: 'image/png',
      sizeBytes: 123,
      width: 800,
      height: 600,
      altText: 'a cat',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.web10.app/alice/upload/confirm',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body).toEqual({
      token: JWT,
      url: 'https://s3.example.com/web10-media',
      filename: 'x.png',
      mime_type: 'image/png',
      size_bytes: 123,
      width: 800,
      height: 600,
      duration_seconds: null,
      thumbnail_url: null,
      caption: null,
      alt_text: 'a cat',
      origin: null,
      origin_id: null,
      encrypted: false,
    })
    expect(result).toEqual(record)
  })

  it('defaults origin_id + duration_seconds to null when not provided', async () => {
    mockFetch.mockResolvedValueOnce(ok({ url: 'u', filename: 'f', created_at: '', encrypted: false }))
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    await w.confirmUpload({ url: 'u', filename: 'f' })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.origin_id).toBeNull()
    expect(body.duration_seconds).toBeNull()
  })

  it('throws without auth', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(() => w.confirmUpload({ url: 'u', filename: 'f' })).toThrow()
  })
})

describe('media upload (presigned POST + confirm)', () => {
  it('requests the url, POSTs the file to S3, then confirms', async () => {
    const file = new FakeBlob([new Uint8Array([1, 2, 3])], {
      type: 'image/png',
      name: 'photo.png',
    })

    // 1. requestUploadUrl
    mockFetch.mockResolvedValueOnce(
      ok({
        upload_url: 'https://s3.example.com/web10-media',
        fields: { key: 'alice/photo.png', Policy: 'P', 'X-Amz-Signature': 'S' },
        object_key: 'alice/abc/photo.png',
        content_type: 'image/png',
      }),
    )
    // 2. S3 multipart POST → 204 No Content (no body)
    const s3Response = { ok: true, status: 204, text: async () => '' }
    mockFetch.mockResolvedValueOnce(s3Response)
    // 3. confirmUpload
    const record: MediaRecord = {
      _id: 'rec1',
      url: 'https://s3.example.com/web10-media',
      filename: 'photo.png',
      created_at: '2026-07-23',
      mime_type: 'image/png',
      size_bytes: 3,
      encrypted: false,
    }
    mockFetch.mockResolvedValueOnce(ok(record))

    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    const result = await w.upload(file, { altText: 'a cat' })

    expect(mockFetch).toHaveBeenCalledTimes(3)
    // request at api
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.web10.app/alice/upload')
    // file POST at s3 with FormData body
    expect(mockFetch.mock.calls[1][0]).toBe('https://s3.example.com/web10-media')
    expect(mockFetch.mock.calls[1][1].method).toBe('POST')
    expect(mockFetch.mock.calls[1][1].body).toBeInstanceOf(FormData)
    // confirm at api carries url + filename + size
    expect(mockFetch.mock.calls[2][0]).toBe('https://api.web10.app/alice/upload/confirm')
    const confirmBody = JSON.parse(mockFetch.mock.calls[2][1].body as string)
    expect(confirmBody).toMatchObject({
      url: 'https://s3.example.com/web10-media',
      filename: 'photo.png',
      mime_type: 'image/png',
      size_bytes: 3,
      alt_text: 'a cat',
    })
    expect(result).toEqual(record)
  })

  it('rejects when the S3 upload fails', async () => {
    const file = new FakeBlob([new Uint8Array([1])], { type: 'image/png', name: 'photo.png' })
    mockFetch.mockResolvedValueOnce(
      ok({ upload_url: 'https://s3.example.com', fields: {}, object_key: 'k', content_type: 'image/png' }),
    )
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'AccessDenied' })

    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    await expect(w.upload(file)).rejects.toThrow(/object storage failed/)
  })

  it('throws without auth', async () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    await expect(w.upload(new Blob([new Uint8Array([1])]))).rejects.toThrow()
  })
})

describe('media getReadUrl + expiry-aware cache', () => {
  it('POSTs /{user}/read and returns the read_url', async () => {
    const response: MediaReadUrlResponse = { read_url: 'https://s3.example.com/signed?token=x', expires_in: 60 }
    mockFetch.mockResolvedValueOnce(ok(response))

    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    const url = await w.getReadUrl('alice/abc/x.png')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.web10.app/alice/read',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body).toEqual({ token: JWT, object_key: 'alice/abc/x.png' })
    expect(url).toBe('https://s3.example.com/signed?token=x')
  })

  it('serves cached URL without a round-trip while fresh', async () => {
    mockFetch.mockResolvedValueOnce(ok({ read_url: 'https://s3.example.com/a', expires_in: 60 }))

    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    await w.getReadUrl('k1') // warm
    const second = await w.getReadUrl('k1') // cache hit
    expect(second).toBe('https://s3.example.com/a')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the cached URL is near expiry', async () => {
    mockFetch.mockResolvedValueOnce(ok({ read_url: 'https://s3.example.com/a', expires_in: 0 }))

    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    await w.getReadUrl('k2') // expires_in: 0 → stale immediately
    mockFetch.mockResolvedValueOnce(ok({ read_url: 'https://s3.example.com/b', expires_in: 60 }))
    const second = await w.getReadUrl('k2')
    expect(second).toBe('https://s3.example.com/b')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('force refresh bypasses the cache', async () => {
    mockFetch.mockResolvedValueOnce(ok({ read_url: 'https://s3.example.com/a', expires_in: 3600 }))
    mockFetch.mockResolvedValueOnce(ok({ read_url: 'https://s3.example.com/b', expires_in: 3600 }))

    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    await w.getReadUrl('k3')
    const forced = await w.getReadUrl('k3', { force: true })
    expect(forced).toBe('https://s3.example.com/b')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('caches per (provider, user) separately', async () => {
    mockFetch.mockResolvedValueOnce(ok({ read_url: 'https://a', expires_in: 3600 }))
    mockFetch.mockResolvedValueOnce(ok({ read_url: 'https://b', expires_in: 3600 }))

    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(JWT)
    const own = await w.getReadUrl('key', { username: 'alice' })
    const other = await w.getReadUrl('key', { username: 'bob', provider: 'api.othernode.com' })
    expect(own).toBe('https://a')
    expect(other).toBe('https://b')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.web10.app/alice/read')
    expect(mockFetch.mock.calls[1][0]).toBe('https://api.othernode.com/bob/read')
  })

  it('throws without auth', async () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    await expect(w.getReadUrl('k')).rejects.toThrow()
  })
})

describe('client surface exposes media methods', () => {
  it('has requestUploadUrl, confirmUpload, upload, getReadUrl', () => {
    const w: Web10Client = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(w).toHaveProperty('requestUploadUrl')
    expect(w).toHaveProperty('confirmUpload')
    expect(w).toHaveProperty('upload')
    expect(w).toHaveProperty('getReadUrl')
  })
})