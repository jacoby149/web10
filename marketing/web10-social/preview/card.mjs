// The web10-social link-preview CARD logic (KB: media/thumbnailing.md).
//
// The social-specific tail of the generic thumbnailing primitive. The platform
// (the node) is 100% generic — it answers "what's the picture for this doc?"
// (`POST /v3/media/thumbnail`), "run this SELECT over my groups" (the query
// engine, `POST /v3/query` — including the D73 face-prepare that mints a face
// URL bound to the face doc's uploader), and "render a card from this spec"
// (`POST /v3/preview/render`). This module is the social part: it maps the
// social permalink → a doc, reads the doc via the generic read, picks the
// thumbnail via the generic primitive, applies the social fallback (the
// author's face through the anon face-prepare seam → brand mark), and asks
// the generic renderer for the card HTML.
//
// Pure of `node:http` (the server is `server.mjs`) so the card logic is
// unit-testable: mock `fetch` (the platform's endpoints) and drive
// `postCard` / `profileCard` directly.
//
// Config via env:
//   API_ORIGIN    — the node's origin (e.g. http://api:80 in Docker).
//   PROVIDER      — the node's public identity, independent of Docker transport.
//   SOCIAL_ORIGIN — the social app's public origin (the canonical og:url).

import { stripMarkdown } from './markdown.mjs'

const API_ORIGIN = (process.env.API_ORIGIN || 'http://api.localhost').replace(/\/$/, '')
const SOCIAL_ORIGIN = (process.env.SOCIAL_ORIGIN || 'http://social.localhost').replace(/\/$/, '')

// Group IDs use the node's PUBLIC identity, never its Docker service alias.
// Non-container callers retain the historical API-host fallback.
export const PROVIDER = process.env.PROVIDER || new URL(API_ORIGIN).hostname

// The social share-card brand mark — the fallback image when a doc has no
// picture and the author has no avatar. Served from the social app's static
// assets (the crawler resolves it against the social origin, where the SPA is
// hosted). D109: the keys mark on its #09090b dark back — the bare white-on-
// transparent mark composites onto the receiving app's white card and goes
// invisible there, so the share image bakes its own background in.
export const BRAND_IMAGE = `${SOCIAL_ORIGIN}/og-image.png`

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

// ── The anon face-prepare seam (D73) ─────────────────────────────────────────
// The face's avatar/banner is a media doc in the uploader's PRIVATE namespace;
// the platform's `/v3/media/thumbnail` I3-gates it to a 404 for anon (the
// media doc's groups deny it), so a direct thumb call can never mint a face
// for a share card — the card fell back to the brand mark even though the
// same face is publicly displayed on the profile / group page (the 4.12.3
// playlist diagnosis, the same defect class). The query engine's face-prepare
// does: the caller's own SELECT over the face doc (I3-scoped to the caller's
// readable groups) + `prepare.face` mints the face URL bound to the face doc's
// UPLOADER (`posted_by or author_key`) — not the viewer — so anon can mint it
// for any face the caller's groups allow reading. The floor holds: a private
// profile / non-public group → no readable row → no URL → the generic card.
//
// Same contract as the shared resolver (`@web10/discover` face.ts, the
// marketing `hydrateAuthors` / the social People tab): the SQL mirrors
// `peopleFaceSql` / `GROUP_FACE_SQL` (latest doc wins — the node orders the
// face stream `created_at DESC`, the QUALIFY pins it), ONE media field per
// query (the face-prepare contract), and a failed query degrades to no face,
// never a throw.
const PROFILE_FACE_SQL =
  'SELECT author_key AS author_key, body AS body FROM profile ' +
  'QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY created_at DESC) = 1'

const GROUP_FACE_SQL =
  'SELECT group_id AS group_id, author_key AS author_key, body AS body ' +
  'FROM `web10-social-group-identity` ' +
  'QUALIFY row_number() OVER (PARTITION BY group_id ORDER BY created_at DESC) = 1'

// One anon face-prepare query (no token — the crawler's reader is anon).
// Returns the result rows (each carries the face doc's `body` + the minted
// urlField column when the face is readable and its ref resolvable), or [] on
// any failure (denied group, no face, engine error — the card degrades).
async function faceQuery(sql, groups, mediaField, urlField) {
  console.log('[preview] face query started', { groups: groups.length, mediaField })
  try {
    const res = await fetch(`${API_ORIGIN}/v3/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, groups, prepare: { face: { bodyField: 'body', mediaField, urlField } } }),
    })
    if (!res.ok) {
      console.warn('[preview] face query unavailable', { status: res.status })
      return []
    }
    const data = await res.json()
    const rows = Array.isArray(data.rows) ? data.rows : []
    console.log('[preview] face query completed', { rows: rows.length })
    return rows
  } catch {
    console.warn('[preview] face query failed; retaining generic card')
    return []
  }
}

// The followers group for an author key: a qualified foreign key
// (`{provider}/users/{username}` — D84) keeps its own provider; a bare local
// key (the node's own users) uses the node's provider (the API host, the same
// derivation as `PROVIDER`).
function followersGroupFor(authorKey) {
  const parts = authorKey.split('/users/')
  if (parts.length === 2 && parts[0]) return `${parts[0]}/groups/users/${parts[1]}/followers`
  return `${PROVIDER}/groups/users/${authorKey}/followers`
}

// The profile face: the latest `profile` doc in the author's followers group
// + its avatar URL (face-prepare-minted for the face doc's uploader). The row
// carries the body (name/bio) AND the picture in one read. null when the
// profile is absent or not readable by anon (the I3 floor).
async function profileFace(authorKey) {
  const rows = await faceQuery(PROFILE_FACE_SQL, [followersGroupFor(authorKey)], 'avatar_ref', 'avatar_url')
  const row = rows.find((r) => r && typeof r === 'object')
  if (!row) return null
  const body = row.body && typeof row.body === 'object' ? row.body : null
  return {
    body,
    avatarUrl: typeof row.avatar_url === 'string' && row.avatar_url ? row.avatar_url : null,
  }
}

// The group face: the latest identity doc in the group + its cover (banner)
// and avatar URLs. Two face-prepares (one media field per query — the
// face-prepare contract), the same split as the shared resolver. null when
// the group has no readable face (non-public, or never set — the I3 floor).
async function groupFace(groupId) {
  const [bannerRows, avatarRows] = await Promise.all([
    faceQuery(GROUP_FACE_SQL, [groupId], 'banner_ref', 'banner_url'),
    faceQuery(GROUP_FACE_SQL, [groupId], 'avatar_ref', 'avatar_url'),
  ])
  const row = bannerRows[0] ?? avatarRows[0]
  if (!row) return null
  const body = row.body && typeof row.body === 'object' ? row.body : null
  if (!body) return null
  return {
    face: body,
    bannerUrl: typeof bannerRows[0]?.banner_url === 'string' ? bannerRows[0].banner_url : null,
    avatarUrl: typeof avatarRows[0]?.avatar_url === 'string' ? avatarRows[0].avatar_url : null,
  }
}

// The social fallback: when a doc has no picture of its own, use the author's
// face — a personal author's profile avatar, a group author's group-face
// avatar (a group post with no media previews the group's face, not a
// nonsense "users/<group id>/followers" read the pre-fix code built) — else
// the caller uses the brand mark. The face resolves through the anon
// face-prepare seam (D73) above — never a media-doc thumbnail call.
export async function authorAvatarUrl(authorKey) {
  if (!authorKey) return null
  if (authorKey.includes('/groups/')) {
    const face = await groupFace(authorKey)
    return face?.avatarUrl ?? null
  }
  const face = await profileFace(authorKey)
  return face?.avatarUrl ?? null
}

// Read a group's face (D60: documents in the `web10-social-group-identity`
// service, group-keyed). The face is a replace-on-write doc stream — the
// LATEST doc wins. Anon-capable for a public group (the group's `anyone` read
// grant); a non-public group 403s → null (the card degrades to generic, the
// I3 floor). Returns the latest identity doc (body = the face) or null.
async function readGroupFace(groupId) {
  const res = await fetch(`${API_ORIGIN}/v3/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'web10-social-group-identity', groups: [groupId] }),
  })
  if (!res.ok) return null
  const docs = await res.json()
  if (!Array.isArray(docs) || docs.length === 0) return null
  // The face is a replace-on-write doc stream — the LATEST doc wins. The node's
  // group read orders created_at DESC (newest first), so docs[0] is the newest
  // (the same contract the app's readGroupIdentity relies on). Taking the LAST
  // doc returned the OLDEST face — a pre-cover name + a missing avatar_ref —
  // and silently dropped every later face update from the share card.
  return docs[0] ?? null
}

// The group permalink: /groups/:groupId (the SPA encodes the group id, which
// contains slashes, into a single path segment). The card shows the group's
// face (D60): the cover (banner) as the image, else the avatar, else the brand
// mark; the face's name + description as the title/description. A group with no
// readable face (non-public, or never set) renders a generic card — the I3 floor.
export async function groupCard(groupId) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/groups/${encodeURIComponent(groupId)}`
  // The group's face (the identity doc + the cover/avatar URLs) resolves
  // through the anon face-prepare seam (D73) — the face's media docs are
  // I3-denied for anon on /v3/media/thumbnail (the pre-fix brand-mark
  // fallback), so the cover can only be minted the way the app mints it:
  // bound to the face doc's uploader. A non-public group (or no face doc) →
  // no readable face → the generic card, no group content (the I3/D41 floor).
  const face = await groupFace(groupId)
  if (!face) {
    return renderCardAnon({
      title: 'A group on web10',
      description: 'Open web10 to view this group.',
      image: BRAND_IMAGE,
      image_alt: 'web10',
      url: canonicalUrl,
      og_type: 'website',
    })
  }
  // The image is the group's cover (banner), else its avatar, else the brand
  // mark.
  const image = face.bannerUrl ?? face.avatarUrl ?? BRAND_IMAGE
  const name = face.face.name ?? null
  const title = truncate(name, TITLE_LIMIT) ?? 'A group on web10'
  const description = truncate(face.face.description, DESC_LIMIT) ?? 'A group on web10'
  return renderCardAnon({
    title,
    description,
    image,
    image_alt: name ?? title,
    url: canonicalUrl,
    og_type: 'website',
  })
}

// The post permalink: /u/:username/p/:postId
export async function postCard(username, postId) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/u/${encodeURIComponent(username)}/p/${encodeURIComponent(postId)}`
  return buildPostCard(postId, canonicalUrl, username)
}

// The watch permalink: /watch/:postId
export async function watchCard(postId) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/watch/${encodeURIComponent(postId)}`
  return buildPostCard(postId, canonicalUrl)
}

// The shorts permalink: /shorts/:postId
export async function shortsCard(postId) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/shorts/${encodeURIComponent(postId)}`
  return buildPostCard(postId, canonicalUrl)
}

// The group post permalink: /groups/:groupId/p/:postId — a post authored by a
// group (the acting identity). The SPA encodes the group id (which contains
// slashes) into a single path segment. The card is the SAME post card as the
// /u/ permalink (the same doc, the same thumbnail, the same fallbacks) with a
// different canonical URL — a watch/shorts-style variant of buildPostCard.
export async function groupPostCard(groupId, postId) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/groups/${encodeURIComponent(groupId)}/p/${encodeURIComponent(postId)}`
  return buildPostCard(postId, canonicalUrl)
}

// The Music app's playlist permalink: /music?view=playlists&collection=<id>
// (the "Share playlist" link the Music view hands out — the LISTENING
// permalink, not the D88 management wall). Same card as the /u/…/saved/…
// shape: the anon face + items read, the cover walk, the I3/D41 floor intact
// (a private playlist's face read fails → the generic card, no content).
export async function musicPlaylistCard(collectionId) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/music?view=playlists&collection=${encodeURIComponent(collectionId)}`
  return buildSavedCard(collectionId, canonicalUrl)
}

// Music shares identify the post in the query string, not a path segment.
export async function musicCard(postId) {
  console.log('[preview] music card start', { hasTrack: Boolean(postId) })
  if (!postId) {
    const html = await renderCardAnon({
      title: 'Music on web10',
      description: 'Open web10 to discover and listen to music.',
      image: BRAND_IMAGE,
      image_alt: 'web10',
      url: `${SOCIAL_ORIGIN}/music`,
      og_type: 'website',
    })
    console.log('[preview] generic music card complete', { rendered: Boolean(html) })
    return html
  }
  const canonicalUrl = `${SOCIAL_ORIGIN}/music?track=${encodeURIComponent(postId)}&panel=player`
  const html = await buildPostCard(postId, canonicalUrl)
  console.log('[preview] music card complete', { rendered: Boolean(html) })
  return html
}

// The personal saved-collection permalink: /u/:username/saved/:collectionId
// (a playlist the app shares out). The collection is a group (D88): its face
// is the `web10-social-group-identity` doc, its items are `saved` docs. A
// PUBLIC collection is anon-readable (the D58 `anyone` reader row); a private
// one is not — its face read 403s and the card degrades to the generic
// playlist card (the I3/D41 floor, exactly like a private group).
export async function savedCard(username, collectionId) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/u/${encodeURIComponent(username)}/saved/${encodeURIComponent(collectionId)}`
  return buildSavedCard(collectionId, canonicalUrl, `by @${username}`)
}

// The group saved-collection permalink: /groups/:groupId/saved/:collectionId
// (a group's playlist — a group is a profile).
export async function groupSavedCard(groupId, collectionId) {
  const canonicalUrl = `${SOCIAL_ORIGIN}/groups/${encodeURIComponent(groupId)}/saved/${encodeURIComponent(collectionId)}`
  return buildSavedCard(collectionId, canonicalUrl)
}

// A bound on how many collection items the cover walk reads (this is a crawl,
// not a feed: one anon post read each). The cover is almost always the first
// item (the auto-set cover) or the pinned one — 12 is generous and cheap.
const COVER_SCAN_LIMIT = 12

// A resolved media ref's displayable picture — the same selection table as
// the node's pure `pick_thumbnail`: audio/video → its `thumbnail_url` (the
// album art / poster, NEVER the recording); an image (or a legacy ref with no
// MIME) → its `read_url`; anything else → null (no picture).
function mediaPicture(ref) {
  if (!ref || typeof ref !== 'object') return null
  const mime = ref.mime_type || ''
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return ref.thumbnail_url || null
  if (mime === '' || mime.startsWith('image/')) return ref.read_url || null
  return null
}

// The collection's cover, resolved through the items' PUBLIC posts.
//
// WHY NOT the face's `avatar_ref` directly: that is a media doc in the
// uploader's private namespace, and the platform's `/v3/media/thumbnail` is
// I3-gated on the doc's groups — anon gets a 404, so the card would fall back
// to the brand mark even though the same album art is publicly displayed on
// the owning post. A public post's read path DOES resolve its media for anon
// (fresh signed read/thumbnail URLs), so the card walks the collection's
// readable items instead: the item containing `avatarRef` in its media
// supplies the picture; a cover with no displayable picture (an art-less
// recording) or no owning item (the post was removed / is unreadable) falls
// back to the first readable item's picture. No readable item with a picture
// → null (the caller uses the brand mark).
async function resolveCollectionCover(postIds, avatarRef) {
  if (!postIds.length) return null
  let firstPicture = null
  for (const postId of postIds.slice(0, COVER_SCAN_LIMIT)) {
    const doc = await readDocAnon(postId, 'posts')
    if (!doc) continue // an unreadable item (I3) — skip it, keep walking
    const refs = (doc.body?.media_refs || []).filter((r) => r && typeof r === 'object')
    if (avatarRef) {
      const owned = refs.find((r) => r.doc_id === avatarRef)
      if (owned) {
        const url = mediaPicture(owned)
        if (url) return { url, alt: owned.alt_text || null }
        // The pinned cover's media has no displayable picture — keep walking.
      }
    }
    if (!firstPicture) {
      for (const ref of refs) {
        const url = mediaPicture(ref)
        if (url) { firstPicture = { url, alt: ref.alt_text || null }; break }
      }
    }
  }
  return firstPicture
}

// The shared saved-collection card: read the collection's face (anon — only a
// public collection is readable), its items (the anon-readable `saved` docs —
// the count AND the cover walk), and render. The cover resolves through the
// items' public posts (see resolveCollectionCover) — never a direct media-doc
// read, which the node's I3 gate denies for anon.
async function buildSavedCard(collectionId, canonicalUrl, attribution) {
  const faceDoc = await readGroupFace(collectionId)
  const face = faceDoc?.body ?? null
  if (!face) {
    // No readable face (a private collection, or a deleted group) → a generic
    // card, no collection content (the I3/D41 privacy floor).
    return renderCardAnon({
      title: 'A playlist on web10',
      description: 'Open web10 to view this playlist.',
      image: BRAND_IMAGE,
      image_alt: 'web10',
      url: canonicalUrl,
      og_type: 'website',
    })
  }
  // The items: one anon read of the collection's `saved` docs (public
  // collections are anon-readable; a failed read omits the count AND leaves
  // the cover unresolved — there is no other anon path to it).
  let items = null
  try {
    const res = await fetch(`${API_ORIGIN}/v3/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'saved', groups: [collectionId], limit: 1000 }),
    })
    if (res.ok) {
      const docs = await res.json()
      if (Array.isArray(docs)) items = docs
    }
  } catch {
    items = null
  }
  const count = items ? items.length : null
  const postIds = (items || [])
    .map((d) => d?.body?.post_id || d?.ref_value || null)
    .filter(Boolean)
  // The cover: the face's avatar_ref (the pinned or auto-set collection
  // thumbnail) is a media doc — resolved through the item that owns it (the
  // public post's read mints the signed album-art URL); no avatar_ref → the
  // first item's picture; nothing readable → the brand mark.
  let image = null
  let imageAlt = null
  const picture = await resolveCollectionCover(postIds, face.avatar_ref || null)
  if (picture) {
    image = picture.url
    imageAlt = picture.alt
  }
  if (!image) image = BRAND_IMAGE
  const name = face.name ?? null
  const title = truncate(name, TITLE_LIMIT) ?? 'A playlist on web10'
  const parts = []
  if (count != null) parts.push(`${count} saved item${count === 1 ? '' : 's'}`)
  if (attribution) parts.push(attribution)
  const description = truncate(parts.join(' · '), DESC_LIMIT) ?? 'Open web10 to view this playlist.'
  return renderCardAnon({
    title,
    description,
    image,
    image_alt: imageAlt ?? name ?? title,
    url: canonicalUrl,
    og_type: 'website',
  })
}

// The shared post-card logic — reads the post, picks the thumbnail, applies
// the social fallback, and renders the card. The canonical URL differs per
// surface (permalink / watch / shorts) but the content is the same post.
async function buildPostCard(postId, canonicalUrl, usernameHint) {
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
  // The post's `text` is markdown (D85) — strip it to plain words BEFORE
  // truncating, so the OG / Twitter card never leaks `**` / `#` / `[]()` / ```
  // (the client-side "one touch," D60-clean — the node stores it opaquely).
  const text = stripMarkdown(doc.body?.text) ?? null
  const headline = stripMarkdown(doc.body?.title)?.trim() || null
  const thumb = await getThumbnailAnon(postId)
  let image = thumb?.url ?? null
  let imageAlt = thumb?.alt ?? null
  let isVideo = thumb?.is_video ?? false
  if (!image) {
    image = (await authorAvatarUrl(doc.author_key)) ?? BRAND_IMAGE
    imageAlt = null
    isVideo = false
  }
  // Derive the username from the doc's author_key (the last path segment) when
  // no hint is provided (the watch/shorts routes don't carry a username).
  const username = usernameHint ?? (doc.author_key?.split('/').pop() || null)
  const title = truncate(headline || text, TITLE_LIMIT) ?? (username ? `@${username} on web10` : 'A post on web10')
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
  // already on the discover board; there are no private accounts) — read
  // through the anon face-prepare seam (D73): ONE query returns the profile
  // doc (name/bio) AND the avatar URL minted for the face doc's uploader. The
  // pre-fix path called /v3/media/thumbnail on the avatar media doc, which the
  // node I3-denies for anon (the avatar doc 404s) — the card fell back to the
  // brand mark for every profile share. Absent / unreadable profile → no row →
  // the generic @username card (the I3 floor).
  const face = await profileFace(username)
  const body = face?.body ?? null
  const displayName = body?.display_name ?? null
  const bio = body?.bio ?? null
  let image = face?.avatarUrl ?? null
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
