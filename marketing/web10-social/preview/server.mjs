// The web10-social link-preview SERVER (KB: media/thumbnailing.md).
//
// A thin HTTP server that hands crawler GETs to the card logic (`card.mjs`).
// The card logic is the social-specific tail of the generic thumbnailing
// primitive; this file is just the transport. Crawlers (Facebook, iMessage, X,
// Slack, …) fetch the permalink; the social nginx proxies only known crawler
// User-Agents here (the browser-default split — everyone else gets the SPA).
// Browsers never hit this server.
//
// Runs in the social app's container alongside nginx (one service, like
// today). Config via env:
//   API_ORIGIN    — the node's origin (e.g. http://api:80 in Docker).
//   SOCIAL_ORIGIN — the social app's public origin (the canonical og:url).
//   PREVIEW_PORT  — the port to listen on (default 3001).

import http from 'node:http'
import { postCard, profileCard, groupCard, groupPostCard, watchCard, shortsCard, musicCard, savedCard, groupSavedCard } from './card.mjs'
import { unfurlService } from './unfurl.mjs'

const PORT = Number(process.env.PREVIEW_PORT || 3001)

// ── GET /preview/unfurl — the browser-facing link-unfurl (KB:
//    web10-v3/social/link-unfurl.md). nginx proxies this for EVERY user-agent
//    (it is the SPA's own same-origin JSON endpoint, not a crawler surface).
//    The response is card metadata (title/description/image/embed-src) fetched
//    by this server from the linked page — the SPA cannot do it (CORS). The
//    SSRF guard + size/timeout caps + cache live in unfurl.mjs.
//    The rate limit is a soft abuse damper (an attacker can use the endpoint
//    as a fetch proxy otherwise); the security boundary is the SSRF guard.
const UNFURL_RATE_MAX = 60
const UNFURL_RATE_WINDOW_MS = 60 * 1000
const unfurlBuckets = new Map() // client ip → { count, resetAt }

function unfurlClientIp(req) {
  // nginx appends the peer address to X-Forwarded-For, so the RIGHTMOST entry
  // is the one we added (the leftmost is client-supplied and ignored).
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.includes(',')) return xff.split(',').pop().trim()
  return req.socket.remoteAddress || 'unknown'
}

function unfurlRateLimited(ip) {
  const now = Date.now()
  let bucket = unfurlBuckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + UNFURL_RATE_WINDOW_MS }
    unfurlBuckets.set(ip, bucket)
    if (unfurlBuckets.size > 10000) unfurlBuckets.clear() // the map is unbounded by ips — a cap, not an eviction
  }
  bucket.count += 1
  return bucket.count > UNFURL_RATE_MAX
}

function jsonBody(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname

  // Health check (the container's liveness probe).
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // Only answer the crawler GETs the nginx split forwarded. Everything else is
  // a 404 (the SPA handles browsers at the nginx layer).
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' })
    res.end('method not allowed')
    return
  }

  // The browser-facing unfurl (all user-agents — nginx proxies it, it is NOT
  // part of the crawler split). Answers card metadata as JSON; the SPA renders
  // it as a rich link card / provider player, or falls back to the plain link
  // when ok is false (unfurling never blocks a post's render).
  if (path === '/preview/unfurl') {
    if (unfurlRateLimited(unfurlClientIp(req))) {
      jsonBody(res, 429, { ok: false, reason: 'rate_limited' })
      return
    }
    const target = url.searchParams.get('url')
    if (!target) {
      jsonBody(res, 400, { ok: false, reason: 'missing_url' })
      return
    }
    try {
      const result = await unfurlService.unfurl(target)
      if (result.ok) jsonBody(res, 200, { ok: true, card: result.card })
      else if (result.reason === 'invalid_url') jsonBody(res, 400, { ok: false, reason: result.reason })
      else if (result.reason === 'blocked') jsonBody(res, 403, { ok: false, reason: result.reason })
      else jsonBody(res, 200, { ok: false, reason: result.reason })
    } catch (err) {
      // The unfurl service never throws (it catches its own seams), but a
      // surprise here must not 500 the request — the client falls back to the
      // plain link either way.
      console.error('[unfurl] route failed:', err)
      jsonBody(res, 200, { ok: false, reason: 'unavailable' })
    }
    return
  }

  try {
    // /u/:username/p/:postId — the post permalink.
    const postMatch = path.match(/^\/u\/([^/]+)\/p\/([^/]+)$/)
    // /u/:username — the profile permalink (no /p/:postId).
    const profileMatch = path.match(/^\/u\/([^/]+)$/)
    // /groups/:groupId — the group permalink. The SPA encodes the group id
    // (which contains slashes) into a single path segment, so the raw path
    // has no literal slash in it; decodeURIComponent restores the group id.
    const groupMatch = path.match(/^\/groups\/([^/]+)$/)
    // /groups/:groupId/p/:postId — a group-authored post permalink (the acting
    // identity's post). Two path segments after /groups/ — checked before the
    // bare group match (the regexes are mutually exclusive, but specificity
    // first).
    const groupPostMatch = path.match(/^\/groups\/([^/]+)\/p\/([^/]+)$/)
    // /u/:username/saved/:collectionId — a personal playlist permalink.
    const savedMatch = path.match(/^\/u\/([^/]+)\/saved\/([^/]+)$/)
    // /groups/:groupId/saved/:collectionId — a group's playlist permalink.
    const groupSavedMatch = path.match(/^\/groups\/([^/]+)\/saved\/([^/]+)$/)
    // /watch/:postId — the watch (landscape video) permalink.
    const watchMatch = path.match(/^\/watch\/([^/]+)$/)
    // /shorts/:postId — the shorts (vertical video) permalink.
    const shortsMatch = path.match(/^\/shorts\/([^/]+)$/)

    let html = null
    if (postMatch) {
      html = await postCard(decodeURIComponent(postMatch[1]), decodeURIComponent(postMatch[2]))
    } else if (groupPostMatch) {
      html = await groupPostCard(decodeURIComponent(groupPostMatch[1]), decodeURIComponent(groupPostMatch[2]))
    } else if (savedMatch) {
      html = await savedCard(decodeURIComponent(savedMatch[1]), decodeURIComponent(savedMatch[2]))
    } else if (groupSavedMatch) {
      html = await groupSavedCard(decodeURIComponent(groupSavedMatch[1]), decodeURIComponent(groupSavedMatch[2]))
    } else if (profileMatch) {
      html = await profileCard(decodeURIComponent(profileMatch[1]))
    } else if (groupMatch) {
      html = await groupCard(decodeURIComponent(groupMatch[1]))
    } else if (watchMatch) {
      html = await watchCard(decodeURIComponent(watchMatch[1]))
    } else if (shortsMatch) {
      html = await shortsCard(decodeURIComponent(shortsMatch[1]))
    } else if (path === '/music') {
      html = await musicCard(url.searchParams.get('track'))
    }

    if (!html) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('not found')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (err) {
    console.error('[preview] card render failed:', err)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('preview unavailable')
  }
})

server.listen(PORT, () => {
  console.log(`[preview] web10-social link-preview server on :${server.address().port}`)
})
