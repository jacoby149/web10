// The /preview/unfurl HTTP route (server.mjs) — the REAL preview process,
// real transport, only the "node API" side of the fixture synthetic (and the
// unfurl target side absent: SSRF rejections must happen BEFORE any fetch,
// which this asserts by pointing the exploit urls at the fixture's own fake
// API and watching it stay quiet). This is the repro-gate for the SSRF
// surface: the exploit URLs are handed over the wire and denied, and the
// denied target is never fetched.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPreviewFixture } from './fixtures/previewHttp.mjs'
import nginx from '../../nginx.conf?raw'

describe('GET /preview/unfurl (the browser-facing link unfurl)', () => {
  let fixture: Awaited<ReturnType<typeof startPreviewFixture>>
  const calls: string[] = []

  beforeAll(async () => {
    fixture = await startPreviewFixture(async (req, res) => {
      calls.push(req.url || '')
      res.setHeader('Content-Type', 'application/json')
      res.end('{}')
    })
  })

  afterAll(async () => {
    await fixture?.close()
  })

  // The fixture's own http seam (.mjs — no browser node typings needed here).
  function get(path: string): Promise<{ status: number, json: any, html: string }> {
    return fixture.get(path).then(({ status, html }) => {
      let json: any = null
      try { json = JSON.parse(html) } catch { /* non-json (the card HTML) */ }
      return { status, json, html }
    })
  }

  it('requires the url query param (400, not a fetch)', async () => {
    const before = calls.length
    const result = await get('/preview/unfurl')
    expect(result.status).toBe(400)
    expect(result.json).toEqual({ ok: false, reason: 'missing_url' })
    expect(calls.length).toBe(before)
  })

  // The fixture's fake API sits on the loopback — the exact target an SSRF
  // exploit hunts for. This must be refused BEFORE the fetch, so `calls`
  // (the fake API's request log) stays untouched: the exploit replayed.
  it('refuses the fixture API itself (loopback) with 403 — and NEVER fetches it', async () => {
    const before = calls.length
    const target = `http://127.0.0.1:${fixture.apiPort}/v3/read`
    const result = await get(`/preview/unfurl?url=${encodeURIComponent(target)}`)
    expect(result.status).toBe(403)
    expect(result.json).toEqual({ ok: false, reason: 'blocked' })
    expect(calls.length).toBe(before) // the exploit replayed was denied
  })

  it.each([
    ['the loopback v6 ip', 'http://[::1]/'],
    ['a private v4 ip', 'http://10.0.0.1/'],
    ['the cloud-metadata link-local', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost by name', 'http://localhost:3001/health'],
    ['a single-label docker service name', 'http://api/'],
    ['an mDNS name', 'http://router.local/'],
    ['a credentials-carrying url', 'http://user:pass@8.8.8.8/'],
  ])('refuses %s with 403 blocked (no fetch leaves the box)', async (_name, url) => {
    const before = calls.length
    const result = await get(`/preview/unfurl?url=${encodeURIComponent(url)}`)
    expect(result.status).toBe(403)
    expect(result.json).toEqual({ ok: false, reason: 'blocked' })
    expect(calls.length).toBe(before)
  })

  it('refuses a non-http(s) scheme with 400', async () => {
    const result = await get(`/preview/unfurl?url=${encodeURIComponent('file:///etc/passwd')}`)
    expect(result.status).toBe(400)
    expect(result.json).toEqual({ ok: false, reason: 'invalid_url' })
  })

  it('answers the ok:false envelope when the target never resolves (the plain-link verdict, JSON, not a 5xx)', async () => {
    // `.invalid` is a reserved TLD (RFC 2606) — a stable "no such host" with
    // no network flake: the DNS failure is exactly the seam under test.
    const result = await get(`/preview/unfurl?url=${encodeURIComponent('https://unresolvable.invalid/x')}`)
    expect(result.status).toBe(200)
    expect(result.json).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('pins the nginx split: /preview/unfurl proxies to the preview server for EVERY user-agent (no crawler gate)', () => {
    const location = nginx.match(/location = \/preview\/unfurl \{([\s\S]*?)\n    \}/)?.[1]
    expect(location).toBeDefined()
    expect(location).toContain('proxy_pass ${PREVIEW_TARGET}/preview/unfurl;')
    // The crawler gate must NOT be on this route (it is a browser endpoint).
    expect(location).not.toContain('$is_link_preview_crawler')
  })

  it('still serves the crawler cards (the unfurl route did not displace the permalink split)', async () => {
    const result = await get('/u/nova/p/ghost')
    // The fake API answers {} to the card's reads — the point is the route
    // still lives and answers the card envelope (never the unfurl JSON).
    expect(result.status).toBe(200)
    expect(result.json?.ok).toBeUndefined()
  })
})
