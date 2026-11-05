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
    expect(html).not.toContain('keys-mark.png')
  })

  it('postCard: a public post with no media falls back to the author avatar', async () => {
    mockPlatform({
      'read:p1': { author_key: 'nova', body: { text: 'just words' } },
      'thumb:p1': { thumbnail: null }, // no media
      'read:groups:["api.test/groups/users/nova/followers"]': [
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
      'read:groups:["api.test/groups/users/nova/followers"]': [], // no profile
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
      'read:groups:["api.test/groups/users/nova/followers"]': [
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
      'read:groups:["api.test/groups/users/nova/followers"]': [
        { author_key: 'nova', body: { display_name: 'Nova', bio: 'hi' } },
      ],
    })
    const html = await profileCard('nova')
    expect(html).toContain('Nova')
    expect(html).toContain('http://social.test/keys-mark.png')
  })

  it('profileCard: an unknown user (no profile doc) renders a generic @username card', async () => {
    mockPlatform({
      'read:groups:["api.test/groups/users/ghost/followers"]': [], // no profile
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
      expect(html).toContain('keys-mark.png')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/thumbnail'))).toBe(false)
    })

    it('retains the brand fallback when the track has no art or avatar', async () => {
      mockPlatform({ 'read:no-art': { author_key: 'nova', body: { title: 'Uncovered' } } })
      const html = await musicCard('no-art')
      expect(html).toContain('Uncovered')
      expect(html).toContain('keys-mark.png')
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
        'read:groups:["api.test/groups/users/nova/followers"]': [
          { author_key: 'nova', body: { display_name: 'Nova', avatar_ref: 'av-1' } },
        ],
        'thumb:av-1': { thumbnail: { url: 'http://minio.test/nova/avatar.png', alt: null, is_video: false } },
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
      expect(html).toContain('http://social.test/keys-mark.png')
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
        'read:groups:["api.test/groups/users/nova/followers"]': [
          { author_key: 'nova', body: { display_name: 'Nova', avatar_ref: 'av-1' } },
        ],
        'thumb:av-1': { thumbnail: { url: 'http://minio.test/nova/avatar.png', alt: null, is_video: false } },
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
      expect(html).toContain('http://social.test/keys-mark.png')
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
      expect(html).not.toContain('keys-mark.png')
      // Anon-only reads (no Authorization header ever leaves the process).
      expect(fetchMock.mock.calls.every(([, init]) => !('Authorization' in (init?.headers || {})))).toBe(true)
    })

    it('a denied group post renders the generic card without a thumbnail request', async () => {
      const fetchMock = mockPlatform({ 'read:private': null })
      const html = await groupPostCard(CLUB, 'private')
      expect(html).toContain('A post on web10')
      expect(html).toContain('keys-mark.png')
      expect(html).toContain(`http://social.test/groups/${encodeURIComponent(CLUB)}/p/private`)
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/thumbnail'))).toBe(false)
    })
  })

  describe('savedCard / groupSavedCard — the playlist permalinks', () => {
    const CLUB = 'api.test/groups/users/nova/club'
    const PLAYLIST = 'api.test/groups/users/nova/saved-jazz-nights'

    function faceHandlers(countDocs: unknown) {
      return {
        [`read:web10-social-group-identity:[${JSON.stringify(PLAYLIST)}]`]: [
          { author_key: PLAYLIST, body: { name: 'Jazz Nights', kind: 'saved', visibility: 'public', avatar_ref: 'cover-1' } },
        ],
        [`read:saved:[${JSON.stringify(PLAYLIST)}]`]: countDocs,
        'thumb:cover-1': { thumbnail: { url: 'http://minio.test/nova/cover.webp', alt: null, is_video: false } },
      }
    }

    it('savedCard: a public playlist renders the name, the cover and the item count', async () => {
      mockPlatform(faceHandlers([{ doc_id: 's1' }, { doc_id: 's2' }, { doc_id: 's3' }]))
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"title":"Jazz Nights"')
      expect(html).toContain('"image":"http://minio.test/nova/cover.webp"')
      expect(html).toContain('3 saved items')
      expect(html).toContain('by @nova')
      expect(html).toContain(`http://social.test/u/nova/saved/${encodeURIComponent(PLAYLIST)}`)
      expect(html).toContain('"og_type":"website"')
    })

    it('savedCard: a cover that is an audio doc resolves to its album art, not the recording', async () => {
      mockPlatform({
        ...faceHandlers([]),
        'thumb:cover-1': { thumbnail: { url: 'http://minio.test/nova/album-art.webp', alt: 'Album art', is_video: false } },
      })
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"image":"http://minio.test/nova/album-art.webp"')
    })

    it('savedCard: a playlist with no cover falls back to the brand mark', async () => {
      mockPlatform({
        [`read:web10-social-group-identity:[${JSON.stringify(PLAYLIST)}]`]: [
          { author_key: PLAYLIST, body: { name: 'No Cover', kind: 'saved', visibility: 'public' } },
        ],
        [`read:saved:[${JSON.stringify(PLAYLIST)}]`]: [{ doc_id: 's1' }],
      })
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"title":"No Cover"')
      expect(html).toContain('http://social.test/keys-mark.png')
      expect(html).toContain('1 saved item')
    })

    it('savedCard: a private playlist (denied face read) renders a generic card with no content and no item read', async () => {
      const fetchMock = mockPlatform({})
      const html = await savedCard('nova', 'api.test/groups/users/nova/saved-secret')
      expect(html).toContain('A playlist on web10')
      expect(html).toContain('http://social.test/keys-mark.png')
      expect(html).toContain(`http://social.test/u/nova/saved/${encodeURIComponent('api.test/groups/users/nova/saved-secret')}`)
      expect(html).not.toContain('secret name')
      // Face read + render only — no thumbnail, no item-count read.
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/thumbnail'))).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('savedCard: a failed item-count read omits the count, keeping the name + cover', async () => {
      mockPlatform({
        ...faceHandlers(null), // the count read answers null → no count
      })
      const html = await savedCard('nova', PLAYLIST)
      expect(html).toContain('"title":"Jazz Nights"')
      expect(html).toContain('http://minio.test/nova/cover.webp')
      expect(html).toContain('"description":"by @nova"')
      expect(html).not.toContain('saved items')
    })

    it('groupSavedCard: a group playlist renders with the group canonical url and no user attribution', async () => {
      mockPlatform(faceHandlers([{ doc_id: 's1' }]))
      const html = await groupSavedCard(CLUB, PLAYLIST)
      expect(html).toContain('"title":"Jazz Nights"')
      expect(html).toContain('1 saved item')
      expect(html).not.toContain('by @')
      expect(html).toContain(`http://social.test/groups/${encodeURIComponent(CLUB)}/saved/${encodeURIComponent(PLAYLIST)}`)
    })
  })
})
