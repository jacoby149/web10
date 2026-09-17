import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The card logic reads API_ORIGIN / SOCIAL_ORIGIN at module load, so stub them
// before the dynamic import (vi.stubEnv is typed by vitest — the browser
// tsconfig has no Node types for `process`).
vi.stubEnv('API_ORIGIN', 'http://api.test')
vi.stubEnv('SOCIAL_ORIGIN', 'http://social.test')

// The card logic is pure of node:http (the server is server.mjs) — it only
// makes fetch calls to the platform's generic endpoints. Mock fetch to route
// by URL and return the platform's responses.
function mockPlatform(handlers: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    // Route by the endpoint path.
    if (url.includes('/v3/read')) {
      const key = body.doc_id ? `read:${body.doc_id}` : `read:groups:${JSON.stringify(body.groups)}`
      const data = handlers[key] ?? handlers['read:default'] ?? null
      return json(data)
    }
    if (url.includes('/v3/media/thumbnail')) {
      return json(handlers[`thumb:${body.doc_id}`] ?? { thumbnail: null })
    }
    if (url.includes('/v3/preview/render')) {
      // The renderer echoes the spec as a recognizable HTML string (the test
      // asserts the spec the card logic sent, not the platform's HTML).
      const html = `<!--card ${JSON.stringify(body)}-->`
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
    }
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('web10-social link-preview card logic (KB: media/thumbnailing.md)', () => {
  let postCard: (u: string, p: string) => Promise<string>
  let profileCard: (u: string) => Promise<string>
  let groupCard: (g: string) => Promise<string>
  let truncate: (s: string, n: number) => string | null

  beforeEach(async () => {
    const mod = await import('../../preview/card.mjs')
    postCard = mod.postCard
    profileCard = mod.profileCard
    groupCard = mod.groupCard
    truncate = mod.truncate
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('truncates long text to the limit with an ellipsis', () => {
    expect(truncate('short', 100)).toBe('short')
    const long = 'word '.repeat(100).trim()
    const out = truncate(long, 100)
    expect(out!.length).toBeLessThanOrEqual(100)
    expect(out!.endsWith('…')).toBe(true)
  })

  it('postCard: a public post with media renders the post text + the media thumbnail', async () => {
    mockPlatform({
      'read:p1': { author_key: 'nova', body: { text: 'check out this clip' } },
      'thumb:p1': { thumbnail: { url: 'http://minio.test/img.png', alt: null, is_video: false } },
    })
    const html = await postCard('nova', 'p1')
    // The card spec sent to the generic renderer carries the post text + the
    // media thumbnail + the canonical permalink.
    expect(html).toContain('check out this clip')
    expect(html).toContain('http://minio.test/img.png')
    expect(html).toContain('http://social.test/u/nova/p/p1')
  })

  it('postCard: a public post with no media falls back to the author avatar', async () => {
    mockPlatform({
      'read:p1': { author_key: 'nova', body: { text: 'just words' } },
      'thumb:p1': { thumbnail: null }, // no media
      'read:groups:["web10/groups/users/nova/followers"]': [
        { author_key: 'nova', body: { display_name: 'Nova', avatar_ref: 'av-1' } },
      ],
      'thumb:av-1': { thumbnail: { url: 'http://minio.test/nova/avatar.png', alt: null, is_video: false } },
    })
    const html = await postCard('nova', 'p1')
    // No media → the author's avatar is the image (the social fallback).
    expect(html).toContain('http://minio.test/nova/avatar.png')
    expect(html).toContain('just words')
  })

  it('postCard: a post with no media and no avatar falls back to the brand mark', async () => {
    mockPlatform({
      'read:p1': { author_key: 'nova', body: { text: 'just words' } },
      'thumb:p1': { thumbnail: null },
      'read:groups:["web10/groups/users/nova/followers"]': [], // no profile
    })
    const html = await postCard('nova', 'p1')
    expect(html).toContain('http://social.test/keys-mark.png')
  })

  it('postCard: a private / unreadable post renders a generic card with no content', async () => {
    mockPlatform({
      'read:p1': null, // the read 404s (the post is not anon-readable)
    })
    const html = await postCard('nova', 'p1')
    // The generic card — no post text, the brand mark, the canonical url.
    expect(html).toContain('A post on web10')
    expect(html).toContain('http://social.test/keys-mark.png')
    expect(html).toContain('http://social.test/u/nova/p/p1')
    // The secret text must not leak.
    expect(html).not.toContain('secret')
  })

  it('profileCard: a profile with an avatar renders the name + bio + the avatar', async () => {
    mockPlatform({
      'read:groups:["web10/groups/users/nova/followers"]': [
        { author_key: 'nova', body: { display_name: 'Nova', bio: 'Synthwave producer', avatar_ref: 'av-1' } },
      ],
      'thumb:av-1': { thumbnail: { url: 'http://minio.test/nova/avatar.png', alt: null, is_video: false } },
    })
    const html = await profileCard('nova')
    expect(html).toContain('Nova')
    expect(html).toContain('Synthwave producer')
    expect(html).toContain('http://minio.test/nova/avatar.png')
    expect(html).toContain('http://social.test/u/nova')
    // A profile card is og:type=profile.
    expect(html).toContain('"og_type":"profile"')
  })

  it('profileCard: a profile with no avatar falls back to the brand mark', async () => {
    mockPlatform({
      'read:groups:["web10/groups/users/nova/followers"]': [
        { author_key: 'nova', body: { display_name: 'Nova', bio: 'hi' } },
      ],
    })
    const html = await profileCard('nova')
    expect(html).toContain('Nova')
    expect(html).toContain('http://social.test/keys-mark.png')
  })

  it('profileCard: an unknown user (no profile doc) renders a generic @username card', async () => {
    mockPlatform({
      'read:groups:["web10/groups/users/ghost/followers"]': [], // no profile
    })
    const html = await profileCard('ghost')
    expect(html).toContain('@ghost on web10')
    expect(html).toContain('http://social.test/keys-mark.png')
    expect(html).toContain('http://social.test/u/ghost')
  })

  const GROUP_ID = 'api.web10.app/groups/users/alice/jazz'

  it('groupCard: a public group with a face renders the name + about + the cover', async () => {
    mockPlatform({
      'read:groups:["api.web10.app/groups/users/alice/jazz"]': [
        {
          author_key: 'alice',
          body: {
            name: 'Jazz Collectors',
            description: 'A vinyl-first jazz community.',
            banner_ref: 'banner-1',
            avatar_ref: 'avatar-1',
          },
        },
      ],
      'thumb:banner-1': { thumbnail: { url: 'http://minio.test/jazz/cover.png', alt: null, is_video: false } },
    })
    const html = await groupCard(GROUP_ID)
    expect(html).toContain('Jazz Collectors')
    expect(html).toContain('A vinyl-first jazz community.')
    // The cover (banner) is the image, not the avatar.
    expect(html).toContain('http://minio.test/jazz/cover.png')
    expect(html).not.toContain('avatar-1')
    // The canonical URL encodes the group id (it contains slashes).
    expect(html).toContain(`http://social.test/groups/${encodeURIComponent(GROUP_ID)}`)
    // A group card is og:type=website.
    expect(html).toContain('"og_type":"website"')
  })

  it('groupCard: a face with no cover falls back to the avatar', async () => {
    mockPlatform({
      'read:groups:["api.web10.app/groups/users/alice/jazz"]': [
        { author_key: 'alice', body: { name: 'Jazz Collectors', avatar_ref: 'avatar-1' } },
      ],
      'thumb:avatar-1': { thumbnail: { url: 'http://minio.test/jazz/avatar.png', alt: null, is_video: false } },
    })
    const html = await groupCard(GROUP_ID)
    expect(html).toContain('Jazz Collectors')
    expect(html).toContain('http://minio.test/jazz/avatar.png')
  })

  it('groupCard: a face with no cover and no avatar falls back to the brand mark', async () => {
    mockPlatform({
      'read:groups:["api.web10.app/groups/users/alice/jazz"]': [
        { author_key: 'alice', body: { name: 'Jazz Collectors' } },
      ],
    })
    const html = await groupCard(GROUP_ID)
    expect(html).toContain('Jazz Collectors')
    expect(html).toContain('http://social.test/keys-mark.png')
  })

  it('groupCard: a group with no readable face renders a generic card with no content', async () => {
    mockPlatform({
      // The face read 403s (a non-public group) → null → the generic card.
      'read:groups:["api.web10.app/groups/users/bob/secret"]': null,
    })
    const html = await groupCard('api.web10.app/groups/users/bob/secret')
    expect(html).toContain('A group on web10')
    expect(html).toContain('http://social.test/keys-mark.png')
    expect(html).toContain(`http://social.test/groups/${encodeURIComponent('api.web10.app/groups/users/bob/secret')}`)
    // The face must not leak.
    expect(html).not.toContain('secret club name')
  })
})
