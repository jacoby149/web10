import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPreviewFixture } from './fixtures/previewHttp.mjs'
import nginx from '../../nginx.conf?raw'

// Real HTTP transport and the unmodified preview process; only the node API
// responses are synthetic. This catches a missing server/query dispatch that
// calling musicCard directly cannot detect.
describe('music preview HTTP routing', () => {
  let fixture: Awaited<ReturnType<typeof startPreviewFixture>>
  const calls: { path: string, body: Record<string, unknown>, authorization?: string }[] = []
  const CLUB = 'api.test/groups/users/nova/club'
  const PLAYLIST = 'api.test/groups/users/nova/saved-jazz-nights'

  beforeAll(async () => {
    fixture = await startPreviewFixture(async (req, res) => {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const body = JSON.parse(raw || '{}')
      calls.push({ path: req.url!, body, authorization: req.headers.authorization })
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/v3/read') {
        if (body.doc_id === 'private') { res.writeHead(403); res.end('{}'); return }
        // The saved-collection face read + item-count read target the same
        // group, so route on the service.
        if (body.service === 'web10-social-group-identity') {
          if (String(body.groups?.[0]).includes('secret')) { res.writeHead(403); res.end('[]'); return }
          res.end(JSON.stringify([{ author_key: PLAYLIST, body: { name: 'Jazz Nights', kind: 'saved', visibility: 'public', avatar_ref: 'cover-1' } }])); return
        }
        if (body.service === 'saved') {
          res.end(JSON.stringify([{ doc_id: 's1' }, { doc_id: 's2' }])); return
        }
        res.end(JSON.stringify({ author_key: CLUB, posted_by: 'nova', body: { title: 'Night Drive', text: 'A recording' } }))
      } else if (req.url === '/v3/media/thumbnail') {
        if (body.doc_id === 'cover-1') res.end(JSON.stringify({ thumbnail: { url: 'https://media.test/playlist-cover.webp', is_video: false } }));
        else res.end(JSON.stringify({ thumbnail: { url: 'https://media.test/album.webp', is_video: false } }))
      } else if (req.url === '/v3/preview/render') {
        res.setHeader('Content-Type', 'text/html')
        res.end(`<html>${JSON.stringify(body)}</html>`)
      } else { res.writeHead(404); res.end('{}') }
    })
  })

  afterAll(async () => {
    await fixture?.close()
  })

  function get(path: string): Promise<{ status: number, html: string }> {
    return fixture.get(path)
  }

  it('keeps music queries on the crawler proxy and the SPA on the browser path', () => {
    const location = nginx.match(/location = \/music \{([\s\S]*?)try_files \/index.html =404;/)?.[1]
    expect(location).toContain('if ($is_link_preview_crawler)')
    expect(location).toContain('proxy_pass ${PREVIEW_TARGET}$request_uri;')
  })

  // The ENCODED permalinks (group face, group post, the playlists) can never
  // use a location regex: nginx decodes %2F BEFORE location matching, so a
  // real encoded group id is multi-segment to the location matcher. They ride
  // the raw-URI maps instead — pin that design (a location regex for these
  // shapes is the regression that silently drops the previews).
  it('matches the encoded group + playlist permalinks on the raw request uri', () => {
    expect(nginx).toContain('map $request_uri $share_encoded_group {')
    expect(nginx).toContain('"~^/groups/[^/]+(\\?|$)"')
    expect(nginx).toContain('"~^/groups/[^/]+/p/[^/]+(\\?|$)"')
    expect(nginx).toContain('"~^/groups/[^/]+/saved/[^/]+(\\?|$)"')
    expect(nginx).toContain('map $request_uri $share_saved_personal {')
    expect(nginx).toContain('"~^/u/[^/]+/saved/[^/]+(\\?|$)"')
    // nginx `if` has no `and` — the crawler gate is folded into the flags via
    // the joined-string maps.
    expect(nginx).toContain('map "$is_link_preview_crawler:$share_encoded_group" $encoded_share_split {')
    expect(nginx).toContain('"1:1"')
    expect(nginx).toContain('map "$is_link_preview_crawler:$share_saved_personal" $saved_share_split {')
    const root = nginx.match(/location \/ \{([\s\S]*?)\n    \}/)?.[1]
    expect(root).toContain('if ($encoded_share_split)')
    expect(root).toContain('if ($saved_share_split)')
    expect(root).toContain('proxy_pass ${PREVIEW_TARGET}$request_uri;')
    expect(root).toContain('try_files $uri $uri/ /index.html;')
    // The dead location-regex shapes are gone (they never matched an encoded id).
    expect(nginx).not.toContain('location ~ ^/groups/(?<share_group_id>[^/]+)$')
    expect(nginx).not.toContain('location ~ ^/groups/(?<share_group_id>[^/]+)/p/')
    expect(nginx).not.toContain('location ~ ^/u/(?<share_username>[^/]+)/saved/')
  })

  it('decodes the exact query id and ignores unrelated player/search state in the card URL', async () => {
    calls.length = 0
    const result = await get('/music?panel=queue&q=ignored&track=track%2B1')
    expect(result.status).toBe(200)
    expect(result.html).toContain('https://media.test/album.webp')
    expect(result.html).toContain('https://social.test/music?track=track%2B1&panel=player')
    expect(result.html).not.toContain('ignored')
    expect(calls[0].body).toEqual({ doc_id: 'track+1', service: 'posts' })
    expect(calls.every(call => !call.authorization)).toBe(true)
  })

  it('returns a generic card after a real HTTP 403 without thumbnail/profile reads', async () => {
    calls.length = 0
    const result = await get('/music?track=private&panel=player')
    expect(result.status).toBe(200)
    expect(result.html).toContain('A post on web10')
    expect(result.html).not.toContain('album.webp')
    expect(calls.map(call => call.path)).toEqual(['/v3/read', '/v3/preview/render'])
  })

  it.each(['/music', '/music?track=&panel=player'])('handles %s without reading a document', async path => {
    calls.length = 0
    const result = await get(path)
    expect(result.status).toBe(200)
    expect(result.html).toContain('Music on web10')
    expect(calls.map(call => call.path)).toEqual(['/v3/preview/render'])
  })

  it('routes the group post permalink through the post card with the album art', async () => {
    calls.length = 0
    const result = await get(`/groups/${encodeURIComponent(CLUB)}/p/track%2B1`)
    expect(result.status).toBe(200)
    expect(result.html).toContain('Night Drive')
    expect(result.html).toContain('https://media.test/album.webp')
    expect(result.html).toContain(`https://social.test/groups/${encodeURIComponent(CLUB)}/p/track%2B1`)
    expect(calls[0].body).toEqual({ doc_id: 'track+1', service: 'posts' })
    expect(calls.every(call => !call.authorization)).toBe(true)
  })

  it('routes a personal playlist permalink through the face, cover and item count', async () => {
    calls.length = 0
    const result = await get(`/u/nova/saved/${encodeURIComponent(PLAYLIST)}`)
    expect(result.status).toBe(200)
    expect(result.html).toContain('"title":"Jazz Nights"')
    expect(result.html).toContain('https://media.test/playlist-cover.webp')
    expect(result.html).toContain('2 saved items')
    expect(result.html).toContain('by @nova')
    expect(result.html).toContain(`https://social.test/u/nova/saved/${encodeURIComponent(PLAYLIST)}`)
    const services = calls.map(call => call.body.service).filter(Boolean)
    expect(services).toEqual(['web10-social-group-identity', 'saved'])
    expect(calls.every(call => !call.authorization)).toBe(true)
  })

  it('routes a group playlist permalink without user attribution', async () => {
    calls.length = 0
    const result = await get(`/groups/${encodeURIComponent(CLUB)}/saved/${encodeURIComponent(PLAYLIST)}`)
    expect(result.status).toBe(200)
    expect(result.html).toContain('"title":"Jazz Nights"')
    expect(result.html).not.toContain('by @')
    expect(result.html).toContain(`https://social.test/groups/${encodeURIComponent(CLUB)}/saved/${encodeURIComponent(PLAYLIST)}`)
  })

  it('returns the generic playlist card for a denied (private) collection without item reads', async () => {
    calls.length = 0
    const secret = 'api.test/groups/users/nova/saved-secret'
    const result = await get(`/u/nova/saved/${encodeURIComponent(secret)}`)
    expect(result.status).toBe(200)
    expect(result.html).toContain('A playlist on web10')
    expect(result.html).toContain('https://social.test/keys-mark.png')
    expect(result.html).not.toContain('playlist-cover.webp')
    const services = calls.map(call => call.body.service).filter(Boolean)
    expect(services).toEqual(['web10-social-group-identity'])
  })
})
