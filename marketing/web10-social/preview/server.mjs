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
import { postCard, profileCard, groupCard } from './card.mjs'

const PORT = Number(process.env.PREVIEW_PORT || 3001)

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

  try {
    // /u/:username/p/:postId — the post permalink.
    const postMatch = path.match(/^\/u\/([^/]+)\/p\/([^/]+)$/)
    // /u/:username — the profile permalink (no /p/:postId).
    const profileMatch = path.match(/^\/u\/([^/]+)$/)
    // /groups/:groupId — the group permalink. The SPA encodes the group id
    // (which contains slashes) into a single path segment, so the raw path
    // has no literal slash in it; decodeURIComponent restores the group id.
    const groupMatch = path.match(/^\/groups\/([^/]+)$/)

    let html = null
    if (postMatch) {
      html = await postCard(decodeURIComponent(postMatch[1]), decodeURIComponent(postMatch[2]))
    } else if (profileMatch) {
      html = await profileCard(decodeURIComponent(profileMatch[1]))
    } else if (groupMatch) {
      html = await groupCard(decodeURIComponent(groupMatch[1]))
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
  console.log(`[preview] web10-social link-preview server on :${PORT}`)
})
