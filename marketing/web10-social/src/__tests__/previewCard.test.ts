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
      let key
      if (body.doc_id) {
        key = `read:${body.doc_id}`
      } else {
        const groupsKey = JSON.stringify(body.groups)
        // A service-scoped key (`read:saved:[…]`) wins over the legacy bare
        // group key — a saved collection's face read and item-count read target
        // the SAME group, so the bare key alone is ambiguous; the legacy key
        // stays for the existing handlers.
        key = handlers[`read:${body.service}:${groupsKey}`] !== undefined
          ? `read:${body.service}:${groupsKey}`
          : `read:groups:${groupsKey}`
      }
      const data = handlers[key] ?? handlers['read:default'] ?? null
      return json(data)
    }
    if (url.includes('/v3/media/thumbnail')) {
      return json(handlers[`thumb:${body.doc_id}`] ?? { thumbnail: null })
    }
    if (url.includes('/v3/query')) {
      // The face-prepare route: key by (media field, groups) — the query SQL is
      // the module's own constant, the discriminator is which face field + which
      // readable group(s) the card asked for. An explicit `null` handler models
      // the node's 403 (a denied group / a face the reader can't read); an
      // absent handler answers no rows (no face — the card degrades).
      const mediaField = body.prepare?.face?.mediaField ?? ''
      const groupsKey = JSON.stringify(body.groups)
      const key = `query:${mediaField}:${groupsKey}`
      if (handlers[key] === null) {
        return new Response(
          JSON.stringify({ detail: 'not a member of the requested group' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        )
      }
      const handler = handlers[key]
      const rows = Array.isArray(handler) ? handler : []
      return json({ rows, count: rows.length })
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
  let groupPostCard: (g: string, p: string) => Promise<string>
  let watchCard: (p: string) => Promise<string>
  let shortsCard: (p: string) => Promise<string>
  let musicCard: (p?: string | null) => Promise<string>
  let musicPlaylistCard: (c: string) => Promise<string>
  let savedCard: (u: string, c: string) => Promise<string>
  let groupSavedCard: (g: string, c: string) => Promise<string>
  let truncate: (s: string, n: number) => string | null
  let stripMarkdown: (s: string) => string

  beforeEach(async () => {
    const mod = await import('../../preview/card.mjs')
    const md = await import('../../preview/markdown.mjs')
    postCard = mod.postCard
    profileCard = mod.profileCard
    groupCard = mod.groupCard
    groupPostCard = mod.groupPostCard
    watchCard = mod.watchCard
    shortsCard = mod.shortsCard
    musicCard = mod.musicCard
    musicPlaylistCard = mod.musicPlaylistCard
    savedCard = mod.savedCard
    groupSavedCard = mod.groupSavedCard
    truncate = mod.truncate
    stripMarkdown = md.stripMarkdown
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

  describe('stripMarkdown — render a markdown string as plain words (D85)', () => {
    it('strips bold / italic / strikethrough, keeping the words', () => {
      expect(stripMarkdown('**bold** and *ital* and ~~gone~~')).toBe('bold and ital and gone')
    })
    it('strips headings, keeping the line words', () => {
      expect(stripMarkdown('## A heading\n### A sub')).toBe('A heading\nA sub')
    })
    it('strips links to their text (not the url)', () => {
      expect(stripMarkdown('see [this site](http://x.test) now')).toBe('see this site now')
    })
    it('strips inline + fenced code, keeping the code text', () => {
      expect(stripMarkdown('run `npm i` to start')).toBe('run npm i to start')
      expect(stripMarkdown('```\nconst a = 1\n```').trim()).toBe('const a = 1')
    })
    it('strips list + blockquote markers, keeping the words', () => {
      expect(stripMarkdown('- one\n> quoted')).toBe('one\nquoted')
    })
    it('leaves a plain-text (pre-markdown) string unchanged', () => {
      expect(stripMarkdown('just words, no syntax')).toBe('just words, no syntax')
    })
    it('keeps INTENTIONAL literal punctuation — not real emphasis (the caveat)', () => {
      // A lone ** / *** / ! with nothing to pair with is literal text, not
      // markdown — it must show as the user typed it.
      expect(stripMarkdown('I am so **** happy')).toBe('I am so **** happy')
      expect(stripMarkdown('wait *** what')).toBe('wait *** what')
      expect(stripMarkdown('really?!?!')).toBe('really?!?!')
      // A space inside the markers means it is NOT emphasis (CommonMark
      // flanking) — literal asterisks the user typed on purpose.
      expect(stripMarkdown('a * single * star')).toBe('a * single * star')
      expect(stripMarkdown('a ** b ** c')).toBe('a ** b ** c')
      expect(stripMarkdown('2 * 3 * 4')).toBe('2 * 3 * 4')
      // …while REAL emphasis (markers hugging the words) is still stripped.
      expect(stripMarkdown('this is **bold** text')).toBe('this is bold text')
      expect(stripMarkdown('a *ital* word')).toBe('a ital word')
    })
  })

  it('postCard: a markdown post renders plain words — no ** / # / []() / ``` leak', async () => {
    mockPlatform({
      'read:p1': {
        author_key: 'nova',
        body: { text: '## Big news\n**bold** and *ital* with [a link](http://x.test) and `code`' },
      },
      'thumb:p1': { thumbnail: { url: 'http://minio.test/img.png', alt: null, is_video: false } },
    })
    const html = await postCard('nova', 'p1')
    // The plain words are there…
    expect(html).toContain('Big news')
    expect(html).toContain('bold')
    expect(html).toContain('a link')
    expect(html).toContain('code')
    // …and the markdown syntax is gone (the OG card must not leak it).
    expect(html).not.toContain('**')
    expect(html).not.toContain('##')
    expect(html).not.toContain('[](')
    expect(html).not.toContain('```')
    // The link's url is not printed either (the text, not the target).
    expect(html).not.toContain('http://x.test')
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

  it.each(['post', 'watch', 'shorts'])('%s share uses the saved headline and matching content poster', async (surface) => {
    mockPlatform({
      'read:film': {
        author_key: 'api.test/groups/users/nova/movies', posted_by: 'nova',
        body: { title: '**Nosferatu (1922)** — Full Film', text: 'Hello! I post public domain movies.' },
      },
      'thumb:film': { thumbnail: { url: 'http://minio.test/nova/film-poster.webp', is_video: true } },
    })
    const html = await (surface === 'post' ? postCard('movies', 'film')
      : surface === 'watch' ? watchCard('film') : shortsCard('film'))
    expect(html).toContain('"title":"Nosferatu (1922) — Full Film"')
    expect(html).toContain('"description":"Hello! I post public domain movies."')
    expect(html).toContain('http://minio.test/nova/film-poster.webp')
    expect(html).not.toContain('og-image.png')
  })

  it('postCard: a public post with no media falls back to the author avatar', async () => {
    mockPlatform({
      'read:p1': { author_key: 'nova', body: { text: 'just words' } },
      'thumb:p1': { thumbnail: null }, // no media
      // The author's avatar media doc is I3-denied for anon on
      // /v3/media/thumbnail (no 'thumb:av-1' handler — the default answers
      // { thumbnail: null }, the real node 404s it). The face-prepare query
      // mints the avatar URL bound to the face doc's uploader instead.
      'query:avatar_ref:["api.test/groups/users/nova/followers"]': [
        { author_key: 'nova', body: { display_name: 'Nova', avatar_ref: 'av-1' }, avatar_url: 'http://minio.test/nova/avatar.png' },
      ],
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
      'query:avatar_ref:["api.test/groups/users/nova/followers"]': [], // no profile face
    })
    const html = await postCard('nova', 'p1')
    expect(html).toContain('http://social.test/og-image.png')
  })

  it('postCard: a group-authored post with no media falls back to the group face avatar', async () => {
    // The pre-fix code built a nonsense `users/<group id>/followers` read for a
    // group author (and I3-404d the face media doc either way). A group post's
    // no-media preview is the GROUP's face avatar, minted by the group
    // face-prepare scoped to the group itself.
    const CLUB = 'api.test/groups/users/nova/club'
    mockPlatform({
      'read:p1': { author_key: CLUB, posted_by: 'nova', body: { text: 'club words' } },
      'thumb:p1': { thumbnail: null },
      ['query:avatar_ref:' + JSON.stringify([CLUB])]: [
        { group_id: CLUB, body: { name: 'The Club', avatar_ref: 'gav-1' }, avatar_url: 'http://minio.test/club/avatar.png' },
      ],
    })
    const html = await postCard('club', 'p1')
    expect(html).toContain('http://minio.test/club/avatar.png')
    expect(html).toContain('club words')
  })

  it('postCard: a foreign (qualified) author key keeps its provider in the face group', async () => {
    const fetchMock = mockPlatform({
      'read:p1': { author_key: 'web10.app/users/nova', body: { text: 'just words' } },
      'thumb:p1': { thumbnail: null },
      'query:avatar_ref:["web10.app/groups/users/nova/followers"]': [
        { author_key: 'web10.app/users/nova', body: { display_name: 'Nova' }, avatar_url: 'http://minio.test/nova/foreign.png' },
      ],
    })
    const html = await postCard('nova', 'p1')
    expect(html).toContain('http://minio.test/nova/foreign.png')
    // The face-prepare is scoped to the FOREIGN provider's followers group
    // (the D84 qualified key), not the local node's.
    expect(
      fetchMock.mock.calls.some(
        ([u, init]) => String(u).includes('/v3/query') && String(init?.body).includes('web10.app/groups/users/nova/followers'),
      ),
    ).toBe(true)
  })

  it('postCard: a private / unreadable post renders a generic card with no content', async () => {
    mockPlatform({
      'read:p1': null, // the read 404s (the post is not anon-readable)
    })
    const html = await postCard('nova', 'p1')
    // The generic card — no post text, the brand mark, the canonical url.
    expect(html).toContain('A post on web10')
    expect(html).toContain('http://social.test/og-image.png')
    expect(html).toContain('http://social.test/u/nova/p/p1')
    // The secret text must not leak.
    expect(html).not.toContain('secret')
  })

  describe('profileCard — the /u/:username share (the anon face-prepare seam)', () => {
    const PROFILE_GROUP = 'api.test/groups/users/nova/followers'

    it('a profile with an avatar renders the name + bio + the avatar', async () => {
      const fetchMock = mockPlatform({
        // The REAL node shape: the avatar media doc is I3-denied for anon on
        // /v3/media/thumbnail (no 'thumb:av-1' handler — the default answers
        // { thumbnail: null }; the node 404s it). ONE face-prepare query returns
        // the profile doc (name/bio) AND the avatar URL minted for the face
        // doc's uploader.
        ['query:avatar_ref:' + JSON.stringify([PROFILE_GROUP])]: [
          { author_key: 'nova', body: { display_name: 'Nova', bio: 'Synthwave producer', avatar_ref: 'av-1' }, avatar_url: 'http://minio.test/nova/avatar.png' },
        ],
      })
      const html = await profileCard('nova')
      expect(html).toContain('Nova')
      expect(html).toContain('Synthwave producer')
      expect(html).toContain('http://minio.test/nova/avatar.png')
      expect(html).toContain('http://social.test/u/nova')
      // A profile card is og:type=profile.
      expect(html).toContain('"og_type":"profile"')
      // The face is NEVER a media-doc thumbnail call (the pre-fix seam; the
      // real node 404s it for anon) — the seam is the face-prepare query.
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/thumbnail'))).toBe(false)
      expect(
        fetchMock.mock.calls.some(
          ([u, init]) => String(u).includes('/v3/query') && String(init?.body).includes('"mediaField":"avatar_ref"'),
        ),
      ).toBe(true)
    })

    it('the face-prepare answer wins when the legacy media-doc thumb also answers (the seam, not the I3-404 path)', async () => {
      // Anti-test: the pre-fix measure (read the profile, thumb the media doc)
      // is answered RIGHT here on purpose — the card must not use it. The
      // face-prepare URL is the only one that lands in the card.
      mockPlatform({
        ['read:groups:' + JSON.stringify([PROFILE_GROUP])]: [
          { author_key: 'nova', body: { display_name: 'Nova', bio: 'Synthwave producer', avatar_ref: 'av-1' } },
        ],
        'thumb:av-1': { thumbnail: { url: 'http://minio.test/LEGACY-thumb.png', alt: null, is_video: false } },
        ['query:avatar_ref:' + JSON.stringify([PROFILE_GROUP])]: [
          { author_key: 'nova', body: { display_name: 'Nova', bio: 'Synthwave producer', avatar_ref: 'av-1' }, avatar_url: 'http://minio.test/nova/avatar.png' },
        ],
      })
      const html = await profileCard('nova')
      expect(html).toContain('http://minio.test/nova/avatar.png')
      expect(html).not.toContain('LEGACY-thumb.png')
    })

    it('a profile with no avatar falls back to the brand mark', async () => {
      mockPlatform({
        ['query:avatar_ref:' + JSON.stringify([PROFILE_GROUP])]: [
          { author_key: 'nova', body: { display_name: 'Nova', bio: 'hi' } }, // no avatar_ref → no minted url
        ],
      })
      const html = await profileCard('nova')
      expect(html).toContain('Nova')
      expect(html).toContain('http://social.test/og-image.png')
    })

    it('an unknown user (no profile doc) renders a generic @username card', async () => {
      mockPlatform({}) // the face query returns no rows → the generic card
      const html = await profileCard('ghost')
      expect(html).toContain('@ghost on web10')
      expect(html).toContain('http://social.test/og-image.png')
      expect(html).toContain('http://social.test/u/ghost')
    })

    it('a private profile (the face read 403s) renders the generic @username card, no leak', async () => {
      mockPlatform({
        ['query:avatar_ref:"api.test/groups/users/bob/followers"']: null, // the node denies
      })
      const html = await profileCard('bob')
      expect(html).toContain('@bob on web10')
      expect(html).toContain('http://social.test/og-image.png')
      expect(html).toContain('http://social.test/u/bob')
      // The face must not leak.
      expect(html).not.toContain('secret')
    })

    it('a failed face query degrades to the brand mark, never a throw', async () => {
      const fetchMock = mockPlatform({})
      // Simulate the seam failing hard (a network error, not just empty rows).
      fetchMock.mockRejectedValueOnce(new Error('boom'))
      const html = await profileCard('nova')
      expect(html).toContain('@nova on web10')
      expect(html).toContain('http://social.test/og-image.png')
    })
  })

  describe('groupCard — the /groups/:groupId share (the anon face-prepare seam)', () => {
    const GROUP_ID = 'api.web10.app/groups/users/alice/jazz'
    const groupsJson = JSON.stringify([GROUP_ID])
    const FACE_BODY = { name: 'Jazz Collectors', description: 'A vinyl-first jazz community.', banner_ref: 'banner-1', avatar_ref: 'avatar-1' }

    it('a public group with a face renders the name + about + the cover', async () => {
      const fetchMock = mockPlatform({
        // The face media docs are I3-denied for anon on /v3/media/thumbnail
        // (no 'thumb:*' handlers — the real node 404s them). The face-prepares
        // mint the cover + avatar bound to the face doc's uploader.
        ['query:banner_ref:' + groupsJson]: [
          { group_id: GROUP_ID, author_key: GROUP_ID, body: FACE_BODY, banner_url: 'http://minio.test/jazz/cover.png' },
        ],
        ['query:avatar_ref:' + groupsJson]: [
          { group_id: GROUP_ID, author_key: GROUP_ID, body: FACE_BODY, avatar_url: 'http://minio.test/jazz/avatar.png' },
        ],
      })
      const html = await groupCard(GROUP_ID)
      expect(html).toContain('Jazz Collectors')
      expect(html).toContain('A vinyl-first jazz community.')
      // The cover (banner) is the image, not the avatar.
      expect(html).toContain('http://minio.test/jazz/cover.png')
      expect(html).not.toContain('http://minio.test/jazz/avatar.png')
      // The bare media doc refs never leak into the card (only minted URLs).
      expect(html).not.toContain('banner-1')
      expect(html).not.toContain('avatar-1')
      // The canonical URL encodes the group id (it contains slashes).
      expect(html).toContain(`http://social.test/groups/${encodeURIComponent(GROUP_ID)}`)
      // A group card is og:type=website.
      expect(html).toContain('"og_type":"website"')
      // No media-doc thumbnail call for the face (the pre-fix seam; the real
      // node 404s it for anon).
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/thumbnail'))).toBe(false)
    })

    it('a face with no cover falls back to the avatar', async () => {
      mockPlatform({
        ['query:banner_ref:' + groupsJson]: [
          { group_id: GROUP_ID, body: { name: 'Jazz Collectors', avatar_ref: 'avatar-1' } }, // no banner_url
        ],
        ['query:avatar_ref:' + groupsJson]: [
          { group_id: GROUP_ID, body: { name: 'Jazz Collectors', avatar_ref: 'avatar-1' }, avatar_url: 'http://minio.test/jazz/avatar.png' },
        ],
      })
      const html = await groupCard(GROUP_ID)
      expect(html).toContain('Jazz Collectors')
      expect(html).toContain('http://minio.test/jazz/avatar.png')
    })

    it('a face with no cover and no avatar falls back to the brand mark', async () => {
      mockPlatform({
        ['query:banner_ref:' + groupsJson]: [{ group_id: GROUP_ID, body: { name: 'Jazz Collectors' } }],
        ['query:avatar_ref:' + groupsJson]: [{ group_id: GROUP_ID, body: { name: 'Jazz Collectors' } }],
      })
      const html = await groupCard(GROUP_ID)
      expect(html).toContain('Jazz Collectors')
      expect(html).toContain('http://social.test/og-image.png')
    })

    it('a group with no readable face renders a generic card with no content', async () => {
      mockPlatform({
        // The face reads 403 (a non-public group) → no rows → the generic card.
        'query:banner_ref:["api.web10.app/groups/users/bob/secret"]': null,
        'query:avatar_ref:["api.web10.app/groups/users/bob/secret"]': null,
      })
      const html = await groupCard('api.web10.app/groups/users/bob/secret')
      expect(html).toContain('A group on web10')
      expect(html).toContain('http://social.test/og-image.png')
      expect(html).toContain(`http://social.test/groups/${encodeURIComponent('api.web10.app/groups/users/bob/secret')}`)
      // The face must not leak.
      expect(html).not.toContain('secret club name')
    })
  })

  describe('musicCard — the query-based track share link', () => {
    it('renders the saved title and album art with the canonical player destination', async () => {
      const fetchMock = mockPlatform({
        'read:track-1': { author_key: 'api.test/groups/users/nova/music', posted_by: 'nova', body: { title: '**Night Drive**', text: 'A new recording' } },
        'thumb:track-1': { thumbnail: { url: 'http://minio.test/nova/album.webp', alt: 'Album cover', is_video: false } },
      })
      const html = await musicCard('track-1')
      expect(html).toContain('"title":"Night Drive"')
      expect(html).toContain('"image":"http://minio.test/nova/album.webp"')
      expect(html).toContain('"url":"http://social.test/music?track=track-1&panel=player"')
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(fetchMock.mock.calls.every(([, init]) => !('Authorization' in (init?.headers || {})))).toBe(true)
    })

    it('does not request thumbnail or author data for a denied track', async () => {
      const fetchMock = mockPlatform({ 'read:private': null })
      const html = await musicCard('private')
      expect(html).toContain('A post on web10')
      expect(html).toContain('og-image.png')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/thumbnail'))).toBe(false)
    })

    it('retains the brand fallback when the track has no art or avatar', async () => {
      mockPlatform({ 'read:no-art': { author_key: 'nova', body: { title: 'Uncovered' } } })
      const html = await musicCard('no-art')
      expect(html).toContain('Uncovered')
      expect(html).toContain('og-image.png')
    })

    it.each([undefined, null, ''])('renders generic Music without document reads for %s', async (track) => {
      const fetchMock = mockPlatform({})
      const html = await musicCard(track)
      expect(html).toContain('Music on web10')
      expect(html).toContain('"url":"http://social.test/music"')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('watchCard — the /watch/:postId share link (the landscape video)', () => {
    it('renders the post text + the media thumbnail + the watch canonical url', async () => {
      mockPlatform({
        'read:p1': { author_key: 'nova', body: { text: 'check out this clip' } },
        'thumb:p1': { thumbnail: { url: 'http://minio.test/clip.png', alt: null, is_video: true } },
      })
      const html = await watchCard('p1')
      expect(html).toContain('check out this clip')
      expect(html).toContain('http://minio.test/clip.png')
      // The canonical url is the WATCH permalink, not the post permalink.
      expect(html).toContain('http://social.test/watch/p1')
      expect(html).not.toContain('/u/nova/p/')
    })

    it('a video post carries is_video in the card spec', async () => {
      mockPlatform({
        'read:p1': { author_key: 'nova', body: { text: 'a video' } },
        'thumb:p1': { thumbnail: { url: 'http://minio.test/clip.png', alt: null, is_video: true } },
      })
      const html = await watchCard('p1')
      expect(html).toContain('"is_video":true')
    })

    it('a post with no media falls back to the author avatar', async () => {
      mockPlatform({
        'read:p1': { author_key: 'nova', body: { text: 'just words' } },
        'thumb:p1': { thumbnail: null },
        // The avatar media doc is I3-denied for anon (the default thumb answer
        // is { thumbnail: null }); the face-prepare mints it instead.
        'query:avatar_ref:["api.test/groups/users/nova/followers"]': [
          { author_key: 'nova', body: { display_name: 'Nova', avatar_ref: 'av-1' }, avatar_url: 'http://minio.test/nova/avatar.png' },
        ],
      })
      const html = await watchCard('p1')
      expect(html).toContain('http://minio.test/nova/avatar.png')
    })

    it('a private / unreadable post renders a generic card with no content', async () => {
      mockPlatform({
        'read:p1': null,
      })
      const html = await watchCard('p1')
      expect(html).toContain('A post on web10')
      expect(html).toContain('http://social.test/og-image.png')
      expect(html).toContain('http://social.test/watch/p1')
    })

    it('derives the username from the doc author for the fallback title', async () => {
      mockPlatform({
        'read:p1': { author_key: 'web10.app/users/nova', body: { text: null } },
        'thumb:p1': { thumbnail: { url: 'http://minio.test/clip.png', alt: null, is_video: true } },
      })
      const html = await watchCard('p1')
      // No text → the title falls back to @username (derived from author_key).
      expect(html).toContain('@nova on web10')
    })
  })

  describe('shortsCard — the /shorts/:postId share link (the vertical video)', () => {
    it('renders the post text + the media thumbnail + the shorts canonical url', async () => {
      mockPlatform({
        'read:p1': { author_key: 'nova', body: { text: 'vertical clip' } },
        'thumb:p1': { thumbnail: { url: 'http://minio.test/short.png', alt: null, is_video: true } },
      })
      const html = await shortsCard('p1')
      expect(html).toContain('vertical clip')
      expect(html).toContain('http://minio.test/short.png')
      // The canonical url is the SHORTS permalink, not the post permalink.
      expect(html).toContain('http://social.test/shorts/p1')
      expect(html).not.toContain('/u/nova/p/')
    })

    it('a video post carries is_video in the card spec', async () => {
      mockPlatform({
        'read:p1': { author_key: 'nova', body: { text: 'a short' } },
        'thumb:p1': { thumbnail: { url: 'http://minio.test/short.png', alt: null, is_video: true } },
      })
      const html = await shortsCard('p1')
      expect(html).toContain('"is_video":true')
    })

    it('a post with no media falls back to the author avatar', async () => {
      mockPlatform({
        'read:p1': { author_key: 'nova', body: { text: 'just words' } },
        'thumb:p1': { thumbnail: null },
        // The avatar media doc is I3-denied for anon (the default thumb answer
        // is { thumbnail: null }); the face-prepare mints it instead.
        'query:avatar_ref:["api.test/groups/users/nova/followers"]': [
          { author_key: 'nova', body: { display_name: 'Nova', avatar_ref: 'av-1' }, avatar_url: 'http://minio.test/nova/avatar.png' },
        ],
      })
      const html = await shortsCard('p1')
      expect(html).toContain('http://minio.test/nova/avatar.png')
    })

    it('a private / unreadable post renders a generic card with no content', async () => {
      mockPlatform({
        'read:p1': null,
      })
      const html = await shortsCard('p1')
      expect(html).toContain('A post on web10')
      expect(html).toContain('http://social.test/og-image.png')
      expect(html).toContain('http://social.test/shorts/p1')
    })
  })

  describe('groupPostCard — the /groups/:groupId/p/:postId share link (group-authored posts)', () => {
    const CLUB = 'api.test/groups/users/nova/club'

    it('renders the post card with the album art and the group canonical url', async () => {
      const fetchMock = mockPlatform({
        'read:track-1': { author_key: CLUB, posted_by: 'nova', body: { title: 'Night Drive', text: 'A recording' } },
        'thumb:track-1': { thumbnail: { url: 'http://minio.test/nova/album.webp', alt: 'Album cover', is_video: false } },
      })
      const html = await groupPostCard(CLUB, 'track-1')
      expect(html).toContain('"title":"Night Drive"')
      expect(html).toContain('"image":"http://minio.test/nova/album.webp"')
      expect(html).toContain(`http://social.test/groups/${encodeURIComponent(CLUB)}/p/track-1`)
      expect(html).not.toContain('og-image.png')
      // Anon-only reads (no Authorization header ever leaves the process).
      expect(fetchMock.mock.calls.every(([, init]) => !('Authorization' in (init?.headers || {})))).toBe(true)
    })

    it('a denied group post renders the generic card without a thumbnail request', async () => {
      const fetchMock = mockPlatform({ 'read:private': null })
      const html = await groupPostCard(CLUB, 'private')
      expect(html).toContain('A post on web10')
      expect(html).toContain('og-image.png')
      expect(html).toContain(`http://social.test/groups/${encodeURIComponent(CLUB)}/p/private`)
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/thumbnail'))).toBe(false)
    })
  })

  describe('savedCard / groupSavedCard — the playlist permalinks', () => {
    const CLUB = 'api.test/groups/users/nova/club'
    const PLAYLIST = 'api.test/groups/users/nova/saved-jazz-nights'

    // The REAL node shape (05.11.2026 production diagnosis): the face's
    // avatar_ref is a media doc in the uploader's private namespace — the
    // platform's /v3/media/thumbnail I3-gates it to 404 for anon. The album
    // art IS anon-resolvable through the PUBLIC POST that owns the media
    // (the post read mints the signed thumbnail_url). The cover walk reads
    // the items' posts, not the media doc.
    const item = (i: number, postId?: string) => ({ doc_id: `s${i}`, body: postId ? { post_id: postId } : {}, ref_value: postId || '' })
    const audioPost = (mediaDoc: string, artUrl: string | null, recordingUrl: string) => ({
      author_key: 'nova',
      body: {
        title: 'A track',
        text: 'A recording',
        media_refs: [{ doc_id: mediaDoc, mime_type: 'audio/mpeg', read_url: recordingUrl, thumbnail_url: artUrl }],
      },
    })

    function faceHandlers(itemDocs: unknown, avatarRef = 'cover-1', extra: Record<string, unknown> = {}) {
      return {
        [`read:web10-social-group-identity:[${JSON.stringify(PLAYLIST)}]`]: [
          { author_key: PLAYLIST, body: { name: 'Jazz Nights', kind: 'saved', visibility: 'public', avatar_ref: avatarRef } },
        ],
        [`read:saved:[${JSON.stringify(PLAYLIST)}]`]: itemDocs,
        ...extra,
      }
    }

    it('savedCard: a public playlist renders the name, the cover and the item count', async () => {
      mockPlatform(
        faceHandlers(
          [item(1, 'p1'), item(2, 'p2'), item(3, 'p3')],
          'cover-1',
          { 'read:p1': audioPost('cover-1', 'http://minio.test/nova/album.webp', 'http://minio.test/nova/recording.mp3') },
        ),
      )
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"title":"Jazz Nights"')
      expect(html).toContain('"image":"http://minio.test/nova/album.webp"')
      expect(html).toContain('3 saved items')
      expect(html).toContain('by @nova')
      expect(html).toContain(`http://social.test/u/nova/saved/${encodeURIComponent(PLAYLIST)}`)
      expect(html).toContain('"og_type":"website"')
    })

    it('savedCard: the cover resolves through the owning item post — never a media-doc thumbnail read (the I3 404)', async () => {
      const fetchMock = mockPlatform(
        faceHandlers(
          [item(1, 'p1'), item(2, 'p2')],
          'cover-2',
          {
            'read:p1': audioPost('media-1', 'http://minio.test/nova/art-1.webp', 'http://minio.test/nova/rec-1.mp3'),
            'read:p2': audioPost('cover-2', 'http://minio.test/nova/art-2.webp', 'http://minio.test/nova/rec-2.mp3'),
          },
        ),
      )
      const html = await savedCard('nova', PLAYLIST)
      // The PINNED cover (cover-2, owned by item 2) — not item 1's art.
      expect(html).toContain('"image":"http://minio.test/nova/art-2.webp"')
      // No /v3/media/thumbnail call at all (the pre-fix code called it on the
      // media doc; the real node 404s that for anon).
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/thumbnail'))).toBe(false)
    })

    it('savedCard: a cover that is an audio doc resolves to its album art, not the recording', async () => {
      mockPlatform(
        faceHandlers([item(1, 'p1')], 'cover-1', {
          'read:p1': audioPost('cover-1', 'http://minio.test/nova/album-art.webp', 'http://minio.test/nova/recording.mp3'),
        }),
      )
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"image":"http://minio.test/nova/album-art.webp"')
      expect(html).not.toContain('"image":"http://minio.test/nova/recording.mp3"')
    })

    it('savedCard: an orphaned cover (no item owns the media) falls back to the first item\'s picture', async () => {
      mockPlatform(
        faceHandlers(
          [item(1, 'p1'), item(2, 'p2')],
          'cover-orphan',
          {
            'read:p1': audioPost('media-1', 'http://minio.test/nova/art-1.webp', 'http://minio.test/nova/rec-1.mp3'),
            'read:p2': audioPost('media-2', 'http://minio.test/nova/art-2.webp', 'http://minio.test/nova/rec-2.mp3'),
          },
        ),
      )
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"image":"http://minio.test/nova/art-1.webp"')
    })

    it('savedCard: an art-less pinned recording falls through to the next readable item\'s picture', async () => {
      mockPlatform(
        faceHandlers(
          [item(1, 'p1'), item(2, 'p2')],
          'cover-1',
          {
            // The pinned cover is an audio with NO album art.
            'read:p1': audioPost('cover-1', null, 'http://minio.test/nova/rec-1.mp3'),
            'read:p2': audioPost('cover-2', 'http://minio.test/nova/art-2.webp', 'http://minio.test/nova/rec-2.mp3'),
          },
        ),
      )
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"image":"http://minio.test/nova/art-2.webp"')
    })

    it('savedCard: a face with no avatar_ref uses the first item\'s picture', async () => {
      mockPlatform(
        faceHandlers(
          [item(1, 'p1'), item(2, 'p2')],
          null,
          {
            'read:p1': audioPost('media-1', 'http://minio.test/nova/art-1.webp', 'http://minio.test/nova/rec-1.mp3'),
            'read:p2': audioPost('media-2', 'http://minio.test/nova/art-2.webp', 'http://minio.test/nova/rec-2.mp3'),
          },
        ),
      )
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"image":"http://minio.test/nova/art-1.webp"')
    })

    it('savedCard: an unreadable item is skipped (I3), the walk continues', async () => {
      mockPlatform(
        faceHandlers(
          [item(1, 'p1'), item(2, 'p2')],
          'cover-2',
          {
            'read:p1': null, // a private post inside the public playlist
            'read:p2': audioPost('cover-2', 'http://minio.test/nova/art-2.webp', 'http://minio.test/nova/rec-2.mp3'),
          },
        ),
      )
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"image":"http://minio.test/nova/art-2.webp"')
    })

    it('savedCard: the cover walk is bounded (no unbounded post reads for big playlists)', async () => {
      const many = Array.from({ length: 15 }, (_, i) => item(i + 1, `p${i + 1}`))
      const handlers: Record<string, unknown> = {}
      for (let i = 1; i <= 15; i++) {
        handlers[`read:p${i}`] = audioPost(`media-${i}`, `http://minio.test/nova/art-${i}.webp`, `http://minio.test/nova/rec-${i}.mp3`)
      }
      // The pinned cover is item 15 — beyond the 12-item scan bound.
      const fetchMock = mockPlatform(faceHandlers(many, 'media-15', handlers))
      const html = await savedCard('nova', PLAYLIST)
      // The fallback (the first readable item's picture), and…
      expect(html).toContain('"image":"http://minio.test/nova/art-1.webp"')
      // …only 12 post reads happened (face + items + 12 posts + render = 15).
      const postReads = fetchMock.mock.calls.filter(([url, init]) =>
        String(url).includes('/v3/read') && String(init?.body).includes('"posts"'),
      )
      expect(postReads.length).toBe(12)
      expect(fetchMock).toHaveBeenCalledTimes(15)
    })

    it('savedCard: the face stream is replace-on-write — the NEWEST face doc wins (not the oldest)', async () => {
      // The node orders face docs created_at DESC: docs[0] is the latest face.
      // The pre-fix readGroupFace took the LAST element (the oldest face) —
      // the pre-rename name and a missing avatar_ref, silently dropping every
      // later face update from the share card.
      mockPlatform({
        [`read:web10-social-group-identity:[${JSON.stringify(PLAYLIST)}]`]: [
          { author_key: PLAYLIST, body: { name: 'Jazz Nights', kind: 'saved', visibility: 'public', avatar_ref: 'cover-1' } },
          { author_key: PLAYLIST, body: { name: 'Old Jazz Nights', kind: 'saved', visibility: 'private' } },
        ],
        [`read:saved:[${JSON.stringify(PLAYLIST)}]`]: [item(1, 'p1')],
        'read:p1': audioPost('cover-1', 'http://minio.test/nova/album.webp', 'http://minio.test/nova/recording.mp3'),
      })
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"title":"Jazz Nights"')
      expect(html).not.toContain('Old Jazz Nights')
      expect(html).toContain('"image":"http://minio.test/nova/album.webp"')
    })

    it('savedCard: a playlist with no readable cover falls back to the brand mark', async () => {
      mockPlatform(
        faceHandlers(
          [item(1, 'p1')],
          null,
          {
            // A text-only post — no media, no picture.
            'read:p1': { author_key: 'nova', body: { text: 'words only' } },
          },
        ),
      )
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"title":"Jazz Nights"')
      expect(html).toContain('http://social.test/og-image.png')
      expect(html).toContain('1 saved item')
    })

    it('savedCard: a private playlist (denied face read) renders a generic card with no content and no item read', async () => {
      const fetchMock = mockPlatform({})
      const html = await savedCard('nova', 'api.test/groups/users/nova/saved-secret')
      expect(html).toContain('A playlist on web10')
      expect(html).toContain('http://social.test/og-image.png')
      expect(html).toContain(`http://social.test/u/nova/saved/${encodeURIComponent('api.test/groups/users/nova/saved-secret')}`)
      expect(html).not.toContain('secret name')
      // Face read + render only — no thumbnail, no item read, no post reads.
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/thumbnail'))).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('savedCard: a failed item read omits the count AND the cover (brand mark), keeping the name', async () => {
      mockPlatform(faceHandlers(null)) // the items read answers null → no count, no cover walk
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"title":"Jazz Nights"')
      expect(html).toContain('http://social.test/og-image.png')
      expect(html).toContain('"description":"by @nova"')
      expect(html).not.toContain('saved items')
    })

    it('groupSavedCard: a group playlist renders with the group canonical url and no user attribution', async () => {
      mockPlatform(
        faceHandlers([item(1, 'p1')], 'cover-1', {
          'read:p1': audioPost('cover-1', 'http://minio.test/nova/album.webp', 'http://minio.test/nova/recording.mp3'),
        }),
      )
      const html = await groupSavedCard(CLUB, PLAYLIST)
      expect(html).toContain('"title":"Jazz Nights"')
      expect(html).toContain('"image":"http://minio.test/nova/album.webp"')
      expect(html).toContain('1 saved item')
      expect(html).not.toContain('by @')
      expect(html).toContain(`http://social.test/groups/${encodeURIComponent(CLUB)}/saved/${encodeURIComponent(PLAYLIST)}`)
    })

    it('musicPlaylistCard: the Music-view share link renders the playlist card (no user attribution — the URL carries no username)', async () => {
      mockPlatform(
        faceHandlers([item(1, 'p1')], 'cover-1', {
          'read:p1': audioPost('cover-1', 'http://minio.test/nova/album.webp', 'http://minio.test/nova/recording.mp3'),
        }),
      )
      const html = await musicPlaylistCard(PLAYLIST)
      expect(html).toContain('"title":"Jazz Nights"')
      expect(html).toContain('"image":"http://minio.test/nova/album.webp"')
      expect(html).toContain('1 saved item')
      expect(html).not.toContain('by @')
      expect(html).toContain(`http://social.test/music?view=playlists&collection=${encodeURIComponent(PLAYLIST)}`)
      expect(html).toContain('"og_type":"website"')
    })

    it('musicPlaylistCard: a denied (private) collection falls to the generic card (the I3 floor)', async () => {
      const fetchMock = mockPlatform({})
      const html = await musicPlaylistCard('api.test/groups/users/nova/saved-secret')
      expect(html).toContain('A playlist on web10')
      expect(html).toContain('http://social.test/og-image.png')
      expect(html).toContain(`http://social.test/music?view=playlists&collection=${encodeURIComponent('api.test/groups/users/nova/saved-secret')}`)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})
