// The web10-social LINK UNFURL logic (KB: web10-v3/social/link-unfurl.md).
//
// The "fetch the page, give me its card" tail of a pasted external link. The
// SPA cannot fetch an arbitrary page's Open Graph tags (CORS), so the fetch is
// server-side — in the SOCIAL APP'S OWN preview server (D60: the node stays
// 100% generic and never learns "Spotify" or "article preview"; the card is
// the social app's tail, exactly like the crawler share card in card.mjs).
//
// The transport is server.mjs (the GET /preview/unfurl route, nginx-exposed to
// browsers); this module is the pure logic so it is unit-testable: inject
// `doFetch` (the network) and `lookup` (DNS) and drive `unfurl(url)` directly.
// Production wires in `globalThis.fetch` + `node:dns`.
//
// SAFETY (this endpoint fetches attacker-influenced URLs):
//   - SSRF guard: http(s) only, no credentials, no single-label / mDNS hosts,
//     and every resolved address must be a PUBLIC ip (loopback, private,
//     link-local, CGNAT, reserved, documentation ranges are all refused
//     BEFORE the fetch, re-checked on every redirect hop).
//   - bounded: per-hop timeout, response-size cap, redirect cap.
//   - cached: a successful card is not re-fetched for days; a failure is not
//     hammered for ten minutes (the negative cache).
//   - the oEmbed / page responses are parsed, never executed: no eval, no
//     innerHTML, no third-party JS. The embed iframe src is allowlisted
//     per-provider on BOTH sides (the server here, the client in the SPA).

import dns from 'node:dns'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

// ── limits ────────────────────────────────────────────────────────────────

export const PAGE_TIMEOUT_MS = 8000
export const OEMBED_TIMEOUT_MS = 6000
export const MAX_PAGE_BYTES = 750 * 1024 // enough headroom for the <head>
export const MAX_OEMBED_BYTES = 256 * 1024
export const MAX_REDIRECTS = 5
export const TITLE_LIMIT = 120
export const DESC_LIMIT = 220
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // a card is a snapshot, not live data
export const NEGATIVE_TTL_MS = 10 * 60 * 1000 // failures: don't hammer the target
export const CACHE_MAX = 2000 // entries; the oldest evict first (insertion order)

// The UA posture (the verified provider matrix, 07.11.2026):
// - The DEFAULT is a browser UA. Most sites serve the same SSR <head> (with
//   the Open Graph tags) to any UA — and several (Bandcamp's edge) actively
//   challenge link-preview bots with a "JavaScript is disabled" wall while
//   serving the real page to a browser UA.
// - CRAWLER_UA_OVERRIDES: a provider whose public shell is bot-only.
//   Instagram hands a login wall to a browser UA but serves the reels
//   shell (og:image + the meta description) to a link-preview bot.
// Add a provider override when a new one misbehaves — the override is the
// seam, not a rewrite. One fetch per unique URL (the cache), no crawl.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const CRAWLER_UA_OVERRIDES = {
  instagram: CRAWLER_UA,
}

function userAgentFor(provider) {
  return CRAWLER_UA_OVERRIDES[provider] || BROWSER_UA
}

// The oEmbed endpoints (all keyless, all public). The TARGET url must belong
// to the same provider (checked below) — the oEmbed host is a fixed public
// origin, never derived from the user's link.
const OEMBED_ENDPOINTS = {
  spotify: 'https://open.spotify.com/oembed',
  soundcloud: 'https://soundcloud.com/oembed',
  tiktok: 'https://www.tiktok.com/oembed',
}

// The per-provider iframe src allowlist (the server half of the two-sided
// embed gate — the client re-checks the same hosts before rendering an
// <iframe>). oEmbed providers are trusted for what they embed, not for
// where they point: a src that escapes the provider's own hosts is dropped.
const EMBED_HOSTS = {
  spotify: ['open.spotify.com'],
  soundcloud: ['w.soundcloud.com', 'soundcloud.com'],
  tiktok: ['www.tiktok.com', 'tiktok.com'],
  bandcamp: ['bandcamp.com', 'www.bandcamp.com'],
}

// ── SSRF guard ────────────────────────────────────────────────────────────

function ipv4ToNumber(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

// [network, prefixLength] — every range that is NOT a public, routable ip.
// (198.51.100 = 0xc63364 — the TEST-NET-2 check bit.)
const PRIVATE_V4_CIDRS = [
  [0x00000000, 8], // 0.0.0.0/8 — "this" network
  [0x0a000000, 8], // 10.0.0.0/8 — RFC1918
  [0x64400000, 10], // 100.64.0.0/10 — CGNAT (RFC6598)
  [0x7f000000, 8], // 127.0.0.0/8 — loopback
  [0xac100000, 12], // 172.16.0.0/12 — RFC1918
  [0xa9fe0000, 16], // 169.254.0.0/16 — link-local (cloud metadata lives here)
  [0xc0000000, 24], // 192.0.0.0/24 — IETF reserved
  [0xc0000200, 28], // 192.0.2.0/28 — TEST-NET-1
  [0xc0a80000, 16], // 192.168.0.0/16 — RFC1918
  [0xc6120000, 15], // 198.18.0.0/15 — benchmarking
  [0xc6336400, 24], // 198.51.100.0/24 — TEST-NET-2
  [0xcb000700, 24], // 203.0.113.0/24 — TEST-NET-3
  [0xe0000000, 4], // 224.0.0.0/4 — multicast
  [0xf0000000, 4], // 240.0.0.0/4 — reserved (incl. 255.255.255.255)
]

export function isPrivateIPv4(ip) {
  const num = ipv4ToNumber(ip)
  if (num === null) return true // unparseable → refuse
  for (const [net, prefix] of PRIVATE_V4_CIDRS) {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
    if ((num & mask) >>> 0 === net) return true
  }
  return false
}

function parseIPv6(ip) {
  // Returns 8 × uint16 groups, or null when unparseable. Handles `::`
  // compression and the dotted-quad tails (`::ffff:1.2.3.4`,
  // `1:2:3:4:5:6:7:8.8.8.8`) — the tail expands to the final two groups.
  let s = String(ip || '').toLowerCase()
  let extra = []
  const v4match = /:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s)
  if (v4match) {
    const parts = v4match[1].split('.').map(Number)
    if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null
    extra = [((parts[0] << 8) | parts[1]) & 0xffff, ((parts[2] << 8) | parts[3]) & 0xffff]
    s = s.slice(0, v4match.index)
    if (s.endsWith(':')) s = s.slice(0, -1) // drop the separator colon before the tail
    if (s === '') s = '::' // the v4 tail sat directly on the compression (::8.8.8.8)
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const parsePart = (part) => (part === '' ? [] : part.split(':').map((t) => (/^[0-9a-f]{1,4}$/.test(t) ? parseInt(t, 16) : NaN)))
  const head = parsePart(halves[0])
  const tail = halves.length === 2 ? parsePart(halves[1]) : []
  if (head.includes(NaN) || tail.includes(NaN)) return null
  if (halves.length === 1) {
    // Uncompressed: exactly 8 groups total (hex + the expanded v4 tail).
    if (head.length + extra.length !== 8) return null
    return [...head, ...extra]
  }
  // Compressed: `::` stands for the remaining zero groups (≥ 1 of them).
  const fixed = head.length + tail.length + extra.length
  if (fixed > 7) return null
  const zeros = Array(8 - fixed).fill(0)
  return [...head, ...zeros, ...tail, ...extra]
}

function embeddedV4(g) {
  return (g[6] >>> 8) + '.' + (g[6] & 0xff) + '.' + (g[7] >>> 8) + '.' + (g[7] & 0xff)
}

export function isPrivateIPv6(ip) {
  const g = parseIPv6(ip)
  if (g === null || g.length !== 8) return true // unparseable → refuse
  if (g.every((x) => x === 0)) return true // ::/128
  // IPv4-mapped (::ffff:a.b.c.d → 0:0:0:0:0:ffff:X:Y) and the deprecated
  // IPv4-compatible (::a.b.c.d → 0:0:0:0:0:0:X:Y) forms — judge the
  // embedded address.
  const fiveZeros = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0
  const isEmbeddedV4 = fiveZeros && (g[5] === 0xffff || (g[5] === 0 && (g[6] !== 0 || g[7] !== 0)))
  if (isEmbeddedV4) return isPrivateIPv4(embeddedV4(g))
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0 && g[7] === 1) return true // ::1
  if ((g[0] & 0xfe00) === 0xfe00) return true // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // 2001:db8::/32 documentation
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true // 64:ff9b::/96 NAT64
  return false
}

export function isPublicAddress(ip) {
  return ip.includes(':') ? !isPrivateIPv6(ip) : !isPrivateIPv4(ip)
}

// Hostname-level refuses (before DNS): reserved names that are never public.
export function isRefusedHostname(host) {
  const h = host.toLowerCase()
  if (h === '' || h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal') || h === 'metadata') return true
  // Single-label names are reserved (RFC 6762 / 6066) and are how docker
  // service names ("api", "clickhouse") + mDNS records look. A public site
  // is always dotted.
  if (!h.includes('.')) return true
  return false
}

/**
 * Validate one fetch target. Throws { code: 'invalid_url' | 'blocked' } on
 * refusal. Returns the (validated) URL. `lookup` is the DNS seam (tests
 * inject a fake; production is dns.promises.lookup).
 */
export async function validateFetchTarget(rawUrl, lookup) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    const e = new Error('not a URL')
    e.code = 'invalid_url'
    throw e
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    const e = new Error('scheme refused')
    e.code = 'blocked'
    throw e
  }
  if (url.username !== '' || url.password !== '') {
    const e = new Error('credentials in url refused')
    e.code = 'blocked'
    throw e
  }
  const host = url.hostname.toLowerCase()
  // An ip literal is judged in place (no DNS for it).
  const isIpLiteral = host.includes(':') || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  if (isIpLiteral) {
    const ip = host.replace(/^\[|\]$/g, '')
    if (!isPublicAddress(ip)) {
      const e = new Error('non-public address')
      e.code = 'blocked'
      throw e
    }
    return url
  }
  if (isRefusedHostname(host)) {
    const e = new Error('refused hostname')
    e.code = 'blocked'
    throw e
  }
  let addresses
  try {
    addresses = await lookup(host, { all: true, verbatim: true })
  } catch {
    const e = new Error('dns failure')
    e.code = 'unavailable'
    throw e
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    const e = new Error('dns empty')
    e.code = 'unavailable'
    throw e
  }
  // Every resolved address must be public — a host that answers with even
  // one private address is ambiguous and gets refused (the rebinding path).
  if (addresses.some((a) => !isPublicAddress(a.address))) {
    const e = new Error('resolves to a non-public address')
    e.code = 'blocked'
    throw e
  }
  return url
}

// ── the guarded fetch ─────────────────────────────────────────────────────

/**
 * Fetch `url` with the full guard set: per-hop validation (scheme/host/DNS),
 * a timeout, a redirect cap with RE-VALIDATION on every hop (a redirect to a
 * private host is the classic SSRF escape — each hop is checked before the
 * next fetch), and a response-size cap.
 *
 * Returns { status, contentType, text, finalUrl } — text is null when the
 * body was truncated (over the cap) or empty.
 */
export async function guardedFetch(url, { doFetch, lookup, timeoutMs, maxBytes, accept, ua, maxRedirects = MAX_REDIRECTS, hop = 0 }) {
  const validated = await validateFetchTarget(url.href, lookup)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await doFetch(validated, {
      redirect: 'manual',
      headers: {
        'User-Agent': ua || BROWSER_UA,
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    })
  } catch (err) {
    const e = new Error(err?.name === 'AbortError' ? 'timeout' : 'fetch failed')
    e.code = 'unavailable'
    throw e
  } finally {
    clearTimeout(timer)
  }

  const status = res.status
  // A redirect: re-validate the NEXT hop (the Location is attacker data) and
  // fetch it. The 3xx body itself is never read.
  if (status >= 300 && status < 400) {
    const location = res.headers.get('location')
    try { await res.body?.cancel?.() } catch { /* already drained */ }
    if (!location) {
      const e = new Error('redirect without location')
      e.code = 'unavailable'
      throw e
    }
    if (hop >= maxRedirects) {
      const e = new Error('too many redirects')
      e.code = 'unavailable'
      throw e
    }
    let next
    try { next = new URL(location, validated) } catch {
      const e = new Error('bad location')
      e.code = 'unavailable'
      throw e
    }
    return guardedFetch(next, { doFetch, lookup, timeoutMs, maxBytes, accept, ua, maxRedirects, hop: hop + 1 })
  }

  if (status === 204 || status >= 400) {
    try { await res.body?.cancel?.() } catch { /* noop */ }
    return { status, contentType: res.headers.get('content-type') || '', text: null, finalUrl: validated.href }
  }

  // 2xx: read the body, byte-capped. Stream-decode so a multi-byte UTF-8
  // sequence split across chunks decodes correctly. A TRUNCATED body still
  // hands back what was read up to the cap: the preview-relevant tags live in
  // the <head> (the first bytes) even on the 800KB+ shells (Instagram's), so
  // the cap bounds the memory, not the extraction.
  let text = ''
  let truncated = false
  if (res.body) {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    let size = 0
    for await (const chunk of res.body) {
      const remaining = maxBytes - size
      if (remaining <= 0) break
      const take = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
      size += take.length
      text += decoder.decode(take, { stream: true })
      if (chunk.length > remaining) {
        truncated = true
        try { await res.body.cancel?.() } catch { /* already at the cap */ }
        break
      }
    }
    if (!truncated) text += decoder.decode()
  } else {
    text = await res.text()
  }
  return { status, contentType: res.headers.get('content-type') || '', text: text || null, truncated, finalUrl: validated.href }
}

// ── the stealth fetcher (the challenge-wall retry) ─────────────────────────
//
// Some edges fingerprint the TLS CLIENT, not just the UA: Bandcamp's Fastly
// edge serves Node's built-in fetch (undici) a "Client Challenge" wall
// (verified live 08.11.2026, from both residential and datacenter hosts:
// the same url + the same browser headers, undici → the 3KB wall, libcurl →
// the 366KB page). The wall is detected by `isChallengeWall`; when it hits,
// the page fetch retries ONCE through this curl-based fetcher — a different
// TLS fingerprint the edge accepts. This is a TRANSPORT swap inside the
// existing guard, not a new path: `guardedFetch` re-runs the full validation
// (scheme/shape/DNS-public) before spawning, curl runs with `--max-redirs 0`
// (a 3xx comes back and the per-hop redirect loop re-validates the Location
// exactly as with the default fetcher — curl itself never follows a redirect
// to a new host), `--max-time` bounds the transfer, and the body still flows
// through guardedFetch's byte cap (single chunk, truncated at the cap).
// Absent curl (or any transfer error) → the wall verdict stands (the plain
// link — the floor, exactly as before the retry existed).

function parseHeaderDump(text) {
  // curl's `-D` dump: the status line + response headers (CRLF), nothing
  // else (the body goes to stdout, not here).
  const lines = String(text || '').split(/\r?\n/)
  const statusMatch = /^HTTP\/[\d.]+\s+(\d{3})/.exec(lines[0] || '')
  const status = statusMatch ? Number(statusMatch[1]) : 0
  const map = {}
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const k = line.slice(0, idx).trim().toLowerCase()
      if (k && !(k in map)) map[k] = line.slice(idx + 1).trim()
    }
  }
  return { status, get: (n) => (n in map ? map[n] : null) }
}

function oneChunkBody(buf) {
  // The guardedFetch contract: an async-iterable of Buffer chunks (+ a
  // no-op cancel — the process is already done by the time this resolves).
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || '')
  return {
    async *[Symbol.asyncIterator]() {
      if (data.length > 0) yield data
    },
    cancel: async () => {},
  }
}

/**
 * Build the curl stealth fetcher (a `doFetch` stand-in for guardedFetch).
 * `curlBin` is injectable (tests point it at a fake script; the production
 * wiring is the container's /usr/bin/curl — `apk add curl`, the Dockerfile).
 */
export function makeCurlStealthFetch(curlBin = process.env.UNFURL_CURL_BIN || 'curl') {
  let availability = null
  const isAvailable = () => {
    if (availability === null) {
      availability = new Promise((resolve) => {
        execFile(curlBin, ['--version'], { timeout: 5000 }, (err) => resolve(!err))
      })
    }
    return availability
  }

  return async function curlStealthFetch(url, { headers = {}, signal } = {}) {
    if (!(await isAvailable())) {
      const e = new Error('curl unavailable (the stealth retry is off)')
      e.code = 'unavailable'
      throw e
    }
    // One temp file for the header dump (the body streams to stdout).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unfurl-curl-'))
    const hdrPath = path.join(dir, 'h.txt')
    // The timeout: a hair over guardedFetch's per-hop budget (its abort also
    // kills the child via the signal listener).
    const timeoutMs = 10_000
    const args = [
      '-s', // silent (errors → stderr, captured)
      '-S',
      '--max-redirs', '0', // redirects are the guardedFetch loop's job, not curl's
      '--max-time', String(Math.ceil(timeoutMs / 1000)), // the curl-level cap (the execFile timeout + the signal kill are the backstops)
      '-D', hdrPath,
      '-H', `User-Agent: ${headers['User-Agent'] || BROWSER_UA}`,
      '-H', `Accept: ${headers['Accept'] || 'text/html'}`,
      '-H', 'Accept-Language: en-US,en;q=0.9',
      url.href,
    ]
    return await new Promise((resolve, reject) => {
      let settled = false
      const finish = (fn) => { if (!settled) { settled = true; fn() } }
      let child
      try {
        child = execFile(curlBin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
          let dump = ''
          try { dump = fs.readFileSync(hdrPath, 'utf8') } catch { /* no headers yet */ }
          const parsed = parseHeaderDump(dump)
          try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best-effort */ }
          // curl exits 0 even on HTTP 4xx/5xx (it got a response) — the
          // status line is the verdict. A non-zero exit with a status line is
          // still a usable response (e.g. a transfer hiccup after headers).
          if (parsed.status >= 200) {
            return finish(() => resolve({
              status: parsed.status,
              headers: { get: parsed.get },
              body: oneChunkBody(stdout),
            }))
          }
          const e = new Error(stderr ? String(stderr).trim().split('\n').pop() : 'curl transfer failed')
          e.code = 'unavailable'
          return finish(() => reject(e))
        })
      } catch (e) {
        return finish(() => reject(Object.assign(new Error('spawn failed'), { code: 'unavailable' })))
      }
      if (signal) {
        if (signal.aborted) child.kill('SIGKILL')
        else signal.addEventListener('abort', () => child.kill('SIGKILL'), { once: true })
      }
    })
  }
}

// ── html → metadata (parse, never execute) ────────────────────────────────

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function unescapeEntities(s) {
  if (!s) return ''
  return String(s).replace(/&(#x?[0-9a-f]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      if (Number.isNaN(code) || code > 0x10ffff) return ' '
      try { return String.fromCodePoint(code) } catch { return ' ' }
    }
    const key = body.toLowerCase()
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m
  })
}

function attrValue(tag, attr) {
  // name="v" / name='v' / name=v (unquoted, no whitespace).
  const m = new RegExp('(?:^|\\s)' + attr + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<]+))', 'i').exec(tag)
  if (!m) return null
  return unescapeEntities(m[1] ?? m[2] ?? m[3] ?? '')
}

/**
 * Extract the link-preview-relevant metadata from an html document.
 * First-occurrence wins per key (the <head> tags come before the body's).
 */
export function extractMetaTags(html) {
  const out = {}
  for (const tagMatch of String(html || '').matchAll(/<meta\b[^>]*>/gi)) {
    const tag = tagMatch[0]
    const key = attrValue(tag, 'property') || attrValue(tag, 'name')
    if (!key) continue
    const k = key.trim().toLowerCase()
    if (!k) continue
    const value = (attrValue(tag, 'content') || '').trim()
    if (value && !(k in out)) out[k] = value
  }
  // The oEmbed-free fallbacks that live outside <meta>.
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (titleTag && !out['title']) {
    out['title'] = unescapeEntities(titleTag[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  }
  return out
}

function stripTags(s) {
  return unescapeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

// The meta-description fallback for pages with no og/twitter description:
// the first <p> with real prose. Skips tracking/cookie boilerplate heuristics
// (a paragraph under 40 chars is almost never the article's lede).
export function firstParagraph(html) {
  for (const m of String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripTags(m[1])
    if (text.length >= 40) return text
  }
  return null
}

// The LAST-resort description: legacy HTML (paulgraham.com, pre-2010 web)
// has no <p> at all — the prose is raw text split by <br> / <font> / newlines
// (raw newlines are line WRAPS, not boundaries — collapsing them is what
// keeps the lede from cutting off mid-sentence). Strip the tags, drop the
// leading title echo + a "Month YYYY" date stamp, and take whole sentences
// up to ~200 chars: the page's actual opening prose.
export function firstProseBlock(html, title) {
  let s = String(html || '')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ') // comments first (an unterminated `<!--` would otherwise leak a `-->`)
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<br\s*\/?>/gi, ' ')
  s = s.replace(/<\/?(?:div|p|section|article|li|tr|table|font|center|h[1-6])\b[^>]*>/gi, ' ')
  s = s.replace(/<[^>]+>/g, ' ')
  s = unescapeEntities(s).replace(/\s+/g, ' ').trim()
  if (!s) return null
  const t = title ? String(title).trim().toLowerCase() : null
  // The page leads with its title (the <h1>-less legacy style — and the
  // <title> text survives the tag strip too) — drop every LEADING echo.
  // (Only leading: the title's words are often part of the lede itself —
  // "…techniques for doing great work…" — and a mid-sentence strip corrupts it.)
  if (t) {
    let guard = 0
    while (guard++ < 3 && s.toLowerCase().startsWith(t)) s = s.slice(t.length).trim()
  }
  // A bare date stamp in front of the lede ("July 2023 …").
  s = s.replace(/^[A-Z][a-z]+ \d{4}\s+/, '')
  const sentences = s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)
  let lede = ''
  for (const sent of sentences) {
    if (t && sent.toLowerCase() === t) continue
    lede = lede ? lede + ' ' + sent : sent
    if (lede.length >= 40 && /[.!?]$/.test(sent)) break // a full sentence with real prose
    if (lede.length > 200) break
  }
  return lede.length >= 40 ? lede : null
}

function isUsableImageSrc(src) {
  if (!src) return false
  if (/^data:/i.test(src)) return false
  const lower = src.toLowerCase()
  if (lower.endsWith('.gif')) return false // tracking pixels, animated junk
  if (/(\bx1\b|1x1|spacer|pixel|blank|tracking|ad-)/i.test(lower)) return false
  return true
}

// The image fallback for pages with no og/twitter image: the first real
// <img src> (resolved against the page url, http(s)-only).
export function firstImage(html, baseUrl) {
  for (const m of String(html || '').matchAll(/<img\b[^>]*>/gi)) {
    const src = attrValue(m[0], 'src') || attrValue(m[0], 'data-src')
    if (!src || !isUsableImageSrc(src)) continue
    let abs
    try { abs = new URL(src, baseUrl).href } catch { continue }
    if (abs.startsWith('http://') || abs.startsWith('https://')) return abs
  }
  return null
}

export function truncate(s, limit) {
  if (!s) return null
  const collapsed = String(s).split(/\s+/).join(' ').trim()
  if (collapsed.length <= limit) return collapsed
  return collapsed.slice(0, limit - 1).replace(/\s+$/, '') + '…'
}

// ── provider dispatch ─────────────────────────────────────────────────────

export function providerForHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^www\./, '')
  if (h === 'spotify.com' || h.endsWith('.spotify.com')) return 'spotify'
  if (h === 'soundcloud.com' || h.endsWith('.soundcloud.com')) return 'soundcloud'
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok'
  if (h === 'instagram.com' || h === 'instagr.am' || h.endsWith('.instagram.com')) return 'instagram'
  if (h === 'bandcamp.com' || h.endsWith('.bandcamp.com')) return 'bandcamp'
  return 'generic'
}

function extractIframeSrc(html) {
  const m = /<iframe\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(String(html || ''))
  if (!m) return null
  // The oEmbed `html` is an HTML fragment — its attribute values are
  // entity-encoded (&amp; in the query string), so unescape before use.
  return unescapeEntities(m[1] ?? m[2] ?? '')
}

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase() } catch { return null }
}

// The display domain (the card's "site" row + the favicon): the provider's
// brand domain when we know it (open.spotify.com → spotify.com), else the
// host with the www. stripped.
const DISPLAY_DOMAINS = {
  spotify: 'spotify.com',
  soundcloud: 'soundcloud.com',
  tiktok: 'tiktok.com',
  instagram: 'instagram.com',
  bandcamp: 'bandcamp.com',
}

export function displayDomain(provider, url) {
  if (DISPLAY_DOMAINS[provider]) return DISPLAY_DOMAINS[provider]
  const host = hostOf(url) || ''
  return host.replace(/^www\./, '')
}

// An oEmbed `html`/`iframe_url` is only accepted when it points back at the
// provider's own embed hosts (the server half of the two-sided gate).
function allowlistedEmbedSrc(provider, src) {
  if (!src) return null
  const host = hostOf(src)
  const allow = EMBED_HOSTS[provider]
  if (!host || !allow || !allow.includes(host)) return null
  return src
}

// TikTok's oEmbed iframe autoplays muted; our placeholder is click-to-load
// (the YouTube pattern) — strip the autoplay/muted params so the player
// starts on the poster with a play control, not mid-song.
function normalizeEmbedUrl(provider, src) {
  try {
    const u = new URL(src)
    if (provider === 'tiktok') {
      u.searchParams.delete('autoplay')
      u.searchParams.delete('muted')
    }
    return u.toString()
  } catch {
    return src
  }
}

function parseOEmbedJson(text) {
  let data
  try { data = JSON.parse(text) } catch { return null }
  if (!data || typeof data !== 'object') return null
  return data
}

// The oEmbed → card mapping. `height`/`width` come from the provider's
// oEmbed answer (Spotify 152, SoundCloud ≤320 capped, TikTok 578 portrait).
function oEmbedCard(provider, url, data) {
  const title = truncate(typeof data.title === 'string' ? data.title : null, TITLE_LIMIT)
  const author = truncate(typeof data.author_name === 'string' ? data.author_name : null, TITLE_LIMIT)
  const description = truncate(typeof data.description === 'string' ? data.description : null, DESC_LIMIT)
  const image = typeof data.thumbnail_url === 'string' && data.thumbnail_url ? data.thumbnail_url : null
  let src = null
  if (provider === 'spotify' && typeof data.iframe_url === 'string') src = data.iframe_url
  if (!src) src = extractIframeSrc(typeof data.html === 'string' ? data.html : null)
  src = allowlistedEmbedSrc(provider, src)
  src = src ? normalizeEmbedUrl(provider, src) : null
  let height = Number(data.height)
  if (!Number.isFinite(height) || height < 80) height = provider === 'soundcloud' ? 300 : 152
  if (provider === 'soundcloud') height = Math.min(height, 320)
  let width = Number(data.width)
  if (!Number.isFinite(width) || width < 40) width = null
  return {
    provider,
    url: url.href,
    domain: displayDomain(provider, url.href),
    title,
    description: author ? truncate(author + (title ? ' · ' + title : ''), DESC_LIMIT) : description,
    author,
    image,
    embed: src ? { src, height: Math.round(height), width: width ? Math.round(width) : null, allow: providerAllow(provider) } : null,
  }
}

function providerAllow(provider) {
  switch (provider) {
    case 'spotify': return 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
    case 'soundcloud': return 'autoplay; encrypted-media'
    case 'tiktok': return 'accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share'
    case 'bandcamp': return 'autoplay; encrypted-media'
    default: return 'autoplay; encrypted-media'
  }
}

// The generic (and bandcamp / instagram) page → card mapping.
function pageCard(provider, url, finalUrl, html, precomputedMeta) {
  const meta = precomputedMeta || extractMetaTags(html)
  const domain = displayDomain(provider, finalUrl || url.href)
  let title = truncate(meta['og:title'] || meta['twitter:title'] || meta['title'], TITLE_LIMIT)
  let description = truncate(
    meta['og:description'] ||
      meta['twitter:description'] ||
      meta['description'] ||
      firstParagraph(html) ||
      firstProseBlock(html, meta['title']),
    DESC_LIMIT,
  )
  let image = meta['og:image'] || meta['twitter:image'] || null
  if (image && !/^https?:/i.test(image)) {
    try { image = new URL(image, finalUrl || url.href).href } catch { image = null }
  }
  if (!image) image = firstImage(html, finalUrl || url.href)

  // Provider-specific touches (the social tail — the generic page logic
  // knows nothing about these shapes).
  let embed = null
  if (provider === 'bandcamp') {
    // Bandcamp's album/track pages advertise an embeddable player when
    // twitter:card is "player" (the og:video:* trio backs it up). The
    // player's DECLARED size is the twitter:player:width/height pair —
    // the size of the EXACT embed the twitter:player src points at
    // (a size=large track player is 350×467). The page's og:video:height
    // can disagree (120 — the small-player figure) and would clip the
    // large iframe, so it is only the fallback.
    const player = meta['twitter:player'] || null
    if (meta['twitter:card'] === 'player' && player) {
      const src = allowlistedEmbedSrc('bandcamp', player)
      if (src) {
        const ph = Number(meta['twitter:player:height'])
        const pw = Number(meta['twitter:player:width'])
        const oh = Number(meta['og:video:height'])
        const ow = Number(meta['og:video:width'])
        const height = Number.isFinite(ph) && ph >= 80 ? ph : Number.isFinite(oh) && oh >= 80 ? oh : 120
        const width = Number.isFinite(pw) && pw >= 40 ? pw : Number.isFinite(ow) && ow >= 40 ? ow : null
        embed = { src, height: Math.round(height), width: width === null ? null : Math.round(width), allow: providerAllow('bandcamp') }
      }
    }
  }
  if (provider === 'instagram') {
    // The reels shell (the crawler-UA response) carries no og:title — the
    // handle + "Instagram" is the honest title. The meta description is
    // "N likes, M comments - handle on DATE: caption…", which reads as the
    // card's description straight up.
    const handleMatch = /^https:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._-]+)\/(?:reel|reels|p|tv|stories)\//.exec(finalUrl || '')
    const handle = handleMatch ? handleMatch[1] : null
    title = title || (handle ? `@${handle} · Instagram` : 'Instagram')
  }

  return {
    provider,
    url: url.href,
    domain,
    title,
    description,
    image: image || null,
    embed,
  }
}

// A bot-challenge WALL is not the page — it is the edge's refusal (Fastly's
// "_fs-ch-" interstitial, Cloudflare's "Just a moment…", the generic
// "JavaScript is disabled"). Bandcamp's edge challenges the unfurler's TLS
// fingerprint (verified live, 07.11.2026) while serving real browsers: the
// honest answer is NO CARD (the plain link), never a "Client Challenge" card
// with an error icon. Detection is title-regex + the wall's own markers in
// the head region (the first 50KB — the walls announce themselves early).
export function isChallengeWall(html, meta) {
  const title = String(meta?.['og:title'] || meta?.['twitter:title'] || meta?.['title'] || '').toLowerCase()
  if (/client challenge|access (denied|blocked|to the site has been refused)|just a moment|attention required|enable javascript|javascript is (disabled|required)|verify (you are|that you are) (a )?human|unusual activity/i.test(title)) return true
  const head = String(html || '').slice(0, 50_000)
  if (/_fs-ch-/i.test(head)) return true // the Fastly Shield challenge asset path (wall-only)
  return false
}

// "Is there a card here at all?" — the ok:false (no_metadata) decision.
// A link that unfurls to nothing renders as the plain link (today's
// behavior), so the bar is: a title with some context, or an image, or an
// embed.
function hasCard(card) {
  if (card.embed) return true
  if (card.image && (card.title || card.domain)) return true
  if (card.title && card.description) return true
  return false
}

// ── the service (cache + dispatch) ────────────────────────────────────────

function normalizeCacheKey(url) {
  return url.protocol + '//' + url.host + url.pathname + url.search
}

/**
 * Create the unfurl service. `deps` is the injectable seam:
 *   doFetch(url, opts)  — the network (default: globalThis.fetch)
 *   lookup(host, opts)  — dns (default: node:dns all/verbatim)
 *   now()               — the clock (tests pin it)
 *   stealthFetch(url, opts) — the challenge-wall retry transport. Default
 *                              null (the wall verdict stands). The production
 *                              singleton below injects makeCurlStealthFetch();
 *                              tests inject fakes.
 *
 * `unfurl(rawUrl)` resolves to:
 *   { ok: true, card }                    — the card (from the network or the cache)
 *   { ok: false, reason: 'invalid_url' }  — not an http(s) url at all (400)
 *   { ok: false, reason: 'blocked' }      — the SSRF guard refused it (403)
 *   { ok: false, reason: 'unavailable' }  — the fetch failed (timeout, 4xx,
 *                                            dns, truncation, not-html) (200)
 *   { ok: false, reason: 'no_metadata' }  — fetched, but nothing to show (200)
 */
export function createUnfurlService(deps = {}) {
  const doFetch = deps.doFetch || (typeof fetch === 'function' ? fetch : null)
  const lookup = deps.lookup || ((host, opts) => dns.promises.lookup(host, { all: true, verbatim: true, ...(opts || {}) }))
  const now = deps.now || (() => Date.now())
  const log = deps.log || ((line) => console.log('[unfurl]', line))
  // The challenge-wall retry transport (absent in a pure consumer — the
  // production singleton below injects the curl fetcher; tests inject fakes).
  const stealthFetch = deps.stealthFetch || null

  if (!doFetch) {
    return {
      async unfurl() {
        return { ok: false, reason: 'unavailable' }
      },
    }
  }

  const cache = new Map() // key → { expiresAt, value }

  function cacheGet(key) {
    const hit = cache.get(key)
    if (!hit) return null
    if (now() >= hit.expiresAt) {
      cache.delete(key)
      return null
    }
    return hit.value
  }

  function cacheSet(key, value, ttlMs) {
    if (cache.size >= CACHE_MAX) {
      // Map iteration order is insertion order — evict the oldest.
      const oldest = cache.keys().next()
      if (!oldest.done) cache.delete(oldest.value)
    }
    cache.set(key, { expiresAt: now() + ttlMs, value })
  }

  async function unfurl(rawUrl) {
    let url
    try {
      url = new URL(rawUrl)
    } catch {
      log(`refused (not a url): ${JSON.stringify(String(rawUrl).slice(0, 80))}`)
      return { ok: false, reason: 'invalid_url' }
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      log(`refused (scheme ${url.protocol}) host=${url.hostname}`)
      return { ok: false, reason: 'invalid_url' }
    }

    const key = normalizeCacheKey(url)
    const cached = cacheGet(key)
    if (cached) {
      log(`cache hit host=${url.hostname} ok=${cached.ok}`)
      return cached
    }

    const started = now()
    let result
    try {
      result = await unfurlFresh(url)
    } catch (err) {
      result = { ok: false, reason: err?.code === 'blocked' ? 'blocked' : err?.code === 'invalid_url' ? 'invalid_url' : 'unavailable' }
    }
    if (result.ok) {
      log(`ok provider=${result.card.provider} host=${url.hostname} ms=${now() - started}`)
      cacheSet(key, result, CACHE_TTL_MS)
    } else {
      log(`not ok reason=${result.reason} host=${url.hostname} ms=${now() - started}`)
      // 'blocked' / 'invalid_url' are stable verdicts — cache them long;
      // 'unavailable' / 'no_metadata' get the short negative TTL.
      cacheSet(key, result, result.reason === 'blocked' || result.reason === 'invalid_url' ? CACHE_TTL_MS : NEGATIVE_TTL_MS)
    }
    return result
  }

  async function unfurlFresh(url) {
    // The SSRF gate (first hop). Redirects re-validate per hop inside
    // guardedFetch.
    await validateFetchTarget(url.href, lookup)

    const provider = providerForHost(url.hostname)
    const oembedEndpoint = OEMBED_ENDPOINTS[provider]

    if (oembedEndpoint) {
      // The provider path: its oEmbed endpoint is the card. A failed oEmbed
      // falls through to the generic page fetch (Spotify track pages carry
      // og tags too — never leave the link bare when we can avoid it).
      const oeUrl = new URL(oembedEndpoint)
      oeUrl.searchParams.set('url', url.href)
      let fetched = null
      try {
        fetched = await guardedFetch(oeUrl, { doFetch, lookup, timeoutMs: OEMBED_TIMEOUT_MS, maxBytes: MAX_OEMBED_BYTES, accept: 'application/json, text/plain', ua: BROWSER_UA })
      } catch (err) {
        log(`oembed failed provider=${provider} err=${err?.message || err}`)
      }
      if (fetched && fetched.status === 200 && fetched.text) {
        const data = parseOEmbedJson(fetched.text)
        if (data && (allowlistedEmbedSrc(provider, typeof data.iframe_url === 'string' ? data.iframe_url : extractIframeSrc(data.html || null)) || (data.title && data.thumbnail_url))) {
          const card = oEmbedCard(provider, url, data)
          if (hasCard(card)) return { ok: true, card }
        }
      }
    }

    // The page path (bandcamp / instagram / generic / oEmbed-fell-through).
    // The wall-retry (the stealth fetcher) lives here: a challenge wall on
    // the default fetcher is retried ONCE through curl (the different TLS
    // fingerprint), still inside guardedFetch (the guard re-runs; curl never
    // follows a redirect). Any failure of the retry → the wall verdict
    // stands (the plain link — the floor).
    const pageOpts = { lookup, timeoutMs: PAGE_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', ua: userAgentFor(provider) }
    let fetched
    try {
      fetched = await guardedFetch(url, { doFetch, ...pageOpts })
    } catch (err) {
      return { ok: false, reason: err?.code === 'blocked' ? 'blocked' : 'unavailable' }
    }
    if (fetched.status === 200 && fetched.text && /text\/html|application\/xhtml/i.test(fetched.contentType)) {
      const wallMeta = extractMetaTags(fetched.text)
      if (isChallengeWall(fetched.text, wallMeta) && stealthFetch) {
        log(`challenge wall host=${url.hostname} (the edge fingerprinted the default fetcher) — stealth retry (curl)`)
        try {
          const retry = await guardedFetch(url, { doFetch: stealthFetch, ...pageOpts })
          if (retry.status === 200 && retry.text && /text\/html|application\/xhtml/i.test(retry.contentType) && !isChallengeWall(retry.text, extractMetaTags(retry.text))) {
            log(`challenge wall CLEARED host=${url.hostname} (the stealth fetcher got the page)`)
            fetched = retry
          } else {
            log(`stealth retry still walled/unusable host=${url.hostname} status=${retry.status} — the wall verdict stands`)
          }
        } catch (err) {
          // curl absent / transfer failed — the wall verdict stands.
          log(`stealth retry failed host=${url.hostname} err=${err?.message || err} — the wall verdict stands`)
        }
      }
    }
    if (fetched.status !== 200 || !fetched.text) return { ok: false, reason: 'unavailable' }
    if (!/text\/html|application\/xhtml/i.test(fetched.contentType)) return { ok: false, reason: 'unavailable' }

    const meta = extractMetaTags(fetched.text)
    // The wall check comes BEFORE the card: a "Client Challenge" wall HAS a
    // title + description + an image — hasCard would pass it.
    if (isChallengeWall(fetched.text, meta)) {
      log(`challenge wall host=${url.hostname} (the edge refused this fetcher — the plain link is the honest card)`)
      return { ok: false, reason: 'no_metadata' }
    }

    const card = pageCard(provider, url, fetched.finalUrl, fetched.text, meta)
    if (!hasCard(card)) return { ok: false, reason: 'no_metadata' }
    return { ok: true, card }
  }

  return {
    unfurl,
    // Test/introspection seams.
    _cache: cache,
    _cacheGet: cacheGet,
  }
}

// A stateless convenience for the server route (the production wiring:
// real dns + real fetch + the curl stealth fetcher — `apk add curl` in the
// Dockerfile; absent curl the wall retry degrades to the wall verdict).
export const unfurlService = createUnfurlService({ stealthFetch: makeCurlStealthFetch() })
