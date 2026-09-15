// The web10-social link-preview CARD logic (KB: media/thumbnailing.md).
//
// The social-specific tail of the generic thumbnailing primitive. The platform
// (the node) is 100% generic — it answers "what's the picture for this doc?"
// (`POST /v3/media/thumbnail`) and "render a card from this spec"
// (`POST /v3/preview/render`). This module is the social part: it maps the
// social permalink → a doc, reads the doc via the generic read, picks the
// thumbnail via the generic primitive, applies the social fallback (author
// avatar → brand mark), and asks the generic renderer for the card HTML.
//
// Pure of `node:http` (the server is `server.mjs`) so the card logic is
// unit-testable: mock `fetch` (the platform's endpoints) and drive
// `postCard` / `profileCard` directly.
//
// Config via env:
//   API_ORIGIN    — the node's origin (e.g. http://api:80 in Docker).
//   SOCIAL_ORIGIN — the social app's public origin (the canonical og:url).

const API_ORIGIN = (process.env.API_ORIGIN || 'http://api.localhost').replace(/\/$/, '')
const SOCIAL_ORIGIN = (process.env.SOCIAL_ORIGIN || 'http://social.localhost').replace(/\/$/, '')

// The social brand mark — the fallback image when a doc has no picture and the
// author has no avatar. Served from the social app's static assets (the crawler
// resolves it against the social origin, where the SPA is hosted).
export const BRAND_IMAGE = `${SOCIAL_ORIGIN}/keys-mark.png`

export const TITLE_LIMIT = 100
export const DESC_LIMIT = 200

export function truncate(s, limit) {
  if (!s) return null
  const collapsed = s.split(/\s+/).join(' ')
  if (collapsed.length <= limit) return collapsed
  return collapsed.slice(0, limit - 1).replace(/\s+$/, '') + '…'
}

// The generic read (anon-capable — a missing token reads as the node's `anon`
// member, so public docs read without a token). Returns the doc (body with
// resolved media) or null if unreadable / not found.
async function readDocAnon(docId, service) {
  const res = await fetch(`${API_ORIGIN}/v3/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_id: docId, service }),
  })
  if (!res.ok) return null
  return res.json()
}

// The generic thumbnail (anon-capable). Returns the platform's thumbnail
// ({url, alt, is_video, …} | null) for a doc — its own media, or (for a media
// doc like an avatar) its own image.
async function getThumbnailAnon(docId) {
  const res = await fetch(`${API_ORIGIN}/v3/media/thumbnail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_id: docId }),
  })
  if (!res.ok) return null
  const body = await res.json()
  return body.thumbnail ?? null
}

// The generic card renderer (pure — no token). Returns the OG/Twitter HTML for
// a card spec. The platform renders the card; we supply the content.
async function renderCardAnon(spec) {
  const res = await fetch(`${API_ORIGIN}/v3/preview/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  })
  if (!res.ok) return null
  return res.text()
}

// Read the author's profile doc. The profile is a doc in the `profile` service
// in the author's followers group — a social detail this module owns (it is the
// social app's preview logic, so it knows its own group structure). The read is
// anon-capable for a public profile (the face is public identity, D41).
async function readAuthorProfile(username) {
  const followersGroup = `web10/groups/users/${username}/followers`
  const res = await fetch(`${API_ORIGIN}/v3/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'profile', groups: [followersGroup] }),
  })
  if (!res.ok) return null
  const docs = await res.json()
  return Array.isArray(docs) ? docs[0] ?? null : null
}

// The social fallback: when a doc has no picture of its own, use the author's
// avatar, then the brand mark. This is the SOCIAL decision — the platform
// returns null and steps back; we decide what to show.
export async function authorAvatarUrl(authorKey) {
  if (!authorKey) return null
  const profile = await readAuthorProfile(authorKey)
  const avatarRef = profile?.body?.avatar_ref
  if (!avatarRef) return null
  const thumb = await getThumbnailAnon(avatarRef) // a media doc → its own url
  return thumb?.url ?? null
}

// The post permalink: /u/:username/p/:postId
export async function postCard(username, postId) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/u/${encodeURIComponent(username)}/p/${encodeURIComponent(postId)}`
  const doc = await readDocAnon(postId, 'posts')
  if (!doc) {
    // A post that isn't publicly readable (private / followers-only) or a
    // ghost → a generic card, no content (the I3/D41 privacy floor).
    return renderCardAnon({
      title: 'A post on web10',
      description: 'Open web10 to view this post.',
      image: BRAND_IMAGE,
      image_alt: 'web10',
      url: canonicalUrl,
    })
  }
  const text = doc.body?.text ?? null
  const thumb = await getThumbnailAnon(postId)
  let image = thumb?.url ?? null
  let imageAlt = thumb?.alt ?? null
  let isVideo = thumb?.is_video ?? false
  if (!image) {
    image = (await authorAvatarUrl(doc.author_key)) ?? BRAND_IMAGE
    imageAlt = null
    isVideo = false
  }
  const title = truncate(text, TITLE_LIMIT) ?? `@${username} on web10`
  const description = truncate(text, DESC_LIMIT) ?? 'A post on web10'
  return renderCardAnon({
    title,
    description,
    image,
    image_alt: imageAlt,
    is_video: isVideo,
    url: canonicalUrl,
  })
}

// The profile permalink: /u/:username
export async function profileCard(username) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/u/${encodeURIComponent(username)}`
  // The profile's face is the account's public identity (the avatar + name are
  // already on the discover board; there are no private accounts) — no
  // anon-read gate, matching the platform's readable-by-design posture (D41).
  const profile = await readAuthorProfile(username)
  const displayName = profile?.body?.display_name ?? null
  const bio = profile?.body?.bio ?? null
  const avatarRef = profile?.body?.avatar_ref ?? null
  let image = null
  if (avatarRef) {
    const thumb = await getThumbnailAnon(avatarRef) // a media doc → its own url
    image = thumb?.url ?? null
  }
  if (!image) image = BRAND_IMAGE
  const title = truncate(displayName, TITLE_LIMIT) ?? `@${username} on web10`
  const description = truncate(bio, DESC_LIMIT) ?? 'A profile on web10'
  return renderCardAnon({
    title,
    description,
    image,
    image_alt: displayName ?? title,
    url: canonicalUrl,
    og_type: 'profile',
  })
}
