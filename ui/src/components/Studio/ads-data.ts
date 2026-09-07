import type { V3Document } from 'web10-npm'

// ── The v3 ad model (ads-dissemination.md, D55) ─────────────────────────────
//
// An ad is a `posts` doc tagged `ad` (creative + a leaf-typed `offer` + a
// `status`). An album is a `posts` doc tagged `ad_album` (name in the body);
// an ad is in a few albums via `album:<album doc_id>` tags on the ad. A post
// carries an ad by its `ad_preference` (the `ad_mode`/`ad_target` columns):
// `pinned` + `target` = the ad's doc_id, or `none`.
//
// The catalog read is the owner's own posts over their followers group,
// filtered client-side (a creator's own posts are a small, bounded set).

export interface AdOffer {
  kind: string
  partner: string
  link: string
  cta: string
  disclosure: string
}

export interface AdItem {
  doc: V3Document
  text: string
  offer: AdOffer
  status: 'active' | 'paused'
  /** album doc_ids this ad belongs to (from `album:<id>` tags) */
  albums: string[]
}

export interface AlbumItem {
  doc: V3Document
  name: string
  /** how many ads are in this album (computed) */
  adCount: number
}

export interface PostItem {
  doc: V3Document
  text: string
  /** the pinned ad's doc_id, or '' when ad_mode is `none` */
  pinnedAdTarget: string
}

export interface AdsCatalogData {
  ads: AdItem[]
  albums: AlbumItem[]
  posts: PostItem[]
}

// ── Followers group (where the creator's posts + ads live) ─────────────────

/**
 * The node-minted followers group ID: `{provider}/groups/users/{username}/followers`.
 * The provider comes from the token (the source of truth the API embeds).
 */
export function followersGroupId(decoded: { provider?: string; username?: string } | null): string {
  const provider = decoded?.provider || 'api.localhost'
  const username = decoded?.username || ''
  return `${provider}/groups/users/${username}/followers`
}

/**
 * Ensure the creator's followers group exists, returning its ID. The catalog
 * read + ad writes both attach to it; a fresh creator has none yet, so create
 * it on first use (the node derives the ID from the token + the name).
 */
export async function ensureFollowersGroup(
  v3: { getGroup: (id: string) => Promise<unknown>; createGroup: (name: string, joinPolicy: string, roles: Record<string, unknown>[], members: { member_key: string; role?: string }[]) => Promise<{ group_id: string }> },
  decoded: { provider?: string; username?: string } | null,
): Promise<string> {
  const groupId = followersGroupId(decoded)
  const username = decoded?.username || ''
  try {
    await v3.getGroup(groupId)
    return groupId
  } catch {
    await v3.createGroup(
      'followers',
      'open',
      [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
        { name: 'member', services: ['posts', 'comments'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      ],
      [{ member_key: username, role: 'owner' }],
    )
    return groupId
  }
}

// ── Leaf-value helpers (document-typing: {type, value} leaves) ─────────────

function leaf(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'value' in value) return String((value as { value?: unknown }).value ?? '')
  return ''
}

// ── Parsers ──

export function parseAd(doc: V3Document): AdItem {
  const body = (doc.body || {}) as Record<string, unknown>
  const offerRaw = (body.offer || {}) as Record<string, unknown>
  const tags = doc.tags || []
  return {
    doc,
    text: leaf(body.text),
    offer: {
      kind: leaf(offerRaw.kind),
      partner: leaf(offerRaw.partner),
      link: leaf(offerRaw.link),
      cta: leaf(offerRaw.cta),
      disclosure: leaf(offerRaw.disclosure),
    },
    status: body.status === 'paused' ? 'paused' : 'active',
    albums: tags.filter(t => t.startsWith('album:')).map(t => t.slice('album:'.length)),
  }
}

export function parseAlbum(doc: V3Document): AlbumItem {
  const body = (doc.body || {}) as Record<string, unknown>
  return {
    doc,
    name: leaf(body.name) || 'Untitled album',
    adCount: 0,
  }
}

// ── Split one feed read into ads / albums / posts ───────────────────────────

export function splitCatalog(docs: V3Document[]): AdsCatalogData {
  const ads: AdItem[] = []
  const albums: AlbumItem[] = []
  const posts: PostItem[] = []
  for (const doc of docs) {
    const tags = doc.tags || []
    if (tags.includes('ad_album')) {
      albums.push(parseAlbum(doc))
    } else if (tags.includes('ad')) {
      ads.push(parseAd(doc))
    } else {
      posts.push({
        doc,
        text: leaf((doc.body || {}).text),
        pinnedAdTarget: doc.ad_target || '',
      })
    }
  }
  const countByAlbum = new Map<string, number>()
  for (const ad of ads) {
    for (const albumId of ad.albums) {
      countByAlbum.set(albumId, (countByAlbum.get(albumId) || 0) + 1)
    }
  }
  for (const album of albums) {
    album.adCount = countByAlbum.get(album.doc.doc_id) || 0
  }
  return { ads, albums, posts }
}

// ── Node ads (D57) — the operator's ad inventory ───────────────────────────
//
// A node ad is a `posts` doc on the discover group, tagged `ad` + `node_ad`,
// authored by the node operator. The read attaches active node ads to posts
// at the operator's `node_ad_percentage` (regardless of the post's ad_mode).
// The operator manages them from the Ad Inventory card (Studio).

/**
 * The node-default discover group ID: `{provider}/groups/web10/discover`.
 * Node ads live here (every user + anon is a member, so they're readable by
 * all). The provider comes from the token.
 */
export function discoverGroupId(provider: string | null | undefined): string {
  return `${provider || 'api.localhost'}/groups/web10/discover`
}

/** A node ad is a posts doc tagged `ad` + `node_ad`. */
export function isNodeAd(doc: V3Document): boolean {
  return (doc.tags || []).includes('node_ad')
}

/** Filter a feed read down to the node ads (the operator's inventory). */
export function splitNodeAds(docs: V3Document[]): AdItem[] {
  return docs.filter(isNodeAd).map(parseAd)
}

/**
 * Build a node ad's body: the same leaf-typed offer as a creator ad, plus the
 * `node_ad` tag (the marker that distinguishes it from a creator ad). No
 * albums — node ads are the operator's inventory, not a creator's catalog.
 */
export function buildNodeAdBody(offer: AdOffer, text: string, status: 'active' | 'paused'): Record<string, unknown> {
  return {
    text,
    tags: ['ad', 'node_ad'],
    offer: {
      kind: { type: 'text', value: offer.kind },
      partner: { type: 'text', value: offer.partner },
      link: { type: 'text', value: offer.link },
      cta: { type: 'text', value: offer.cta },
      disclosure: { type: 'text', value: offer.disclosure },
    },
    status,
  }
}

// ── Offer builder (leaf-typed, D55) ─────────────────────────────────────────

export function buildOfferBody(offer: AdOffer, text: string, status: 'active' | 'paused', albumIds: string[]): Record<string, unknown> {
  const tags = ['ad', ...albumIds.map(id => `album:${id}`)]
  return {
    text,
    tags,
    offer: {
      kind: { type: 'text', value: offer.kind },
      partner: { type: 'text', value: offer.partner },
      link: { type: 'text', value: offer.link },
      cta: { type: 'text', value: offer.cta },
      disclosure: { type: 'text', value: offer.disclosure },
    },
    status,
  }
}
