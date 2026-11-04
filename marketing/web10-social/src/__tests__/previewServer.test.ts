import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPreviewFixture } from './fixtures/previewHttp.mjs'
import nginx from '../../nginx.conf?raw'

// Real HTTP transport and the unmodified preview process; only the node API
// responses are synthetic. This catches a missing server/query dispatch that
// calling musicCard directly cannot detect.
describe('music preview HTTP routing', () => {
  let fixture: Awaited<ReturnType<typeof startPreviewFixture>>
  const calls: { path: string, body: Record<string, unknown>, authorization?: string }[] = []

  beforeAll(async () => {
    fixture = await startPreviewFixture(async (req, res) => {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const body = JSON.parse(raw || '{}')
      calls.push({ path: req.url!, body, authorization: req.headers.authorization })
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/v3/read') {
        if (body.doc_id === 'private') { res.writeHead(403); res.end('{}'); return }
        res.end(JSON.stringify({ author_key: 'nova', body: { title: 'Night Drive', text: 'A recording' } }))
      } else if (req.url === '/v3/media/thumbnail') {
        res.end(JSON.stringify({ thumbnail: { url: 'https://media.test/album.webp', is_video: false } }))
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
})
