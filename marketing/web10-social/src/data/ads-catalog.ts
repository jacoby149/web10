// ── ads-catalog.ts — the app-owned ad catalog + monetization data (D75) ─────
// The ad *mechanism* is a node primitive and is service-agnostic (the node does
// not vet an ad's collection_name). The ad *catalog* + monetization *onboarding*
// are app-owned: web10-social shapes an ad as a `posts` doc tagged `ad` (the
// social shape). This module is the data layer for the /monetize surface.
//
// KB: knowledge/knowledge-base/web10-v3/social/monetization.md (D75) +
// ads.md (the object) + ads-dissemination.md (the ad_preference) + node-ads.md
// (the operator's inventory).
//
// Ported from the authenticator's Studio `ads-data.ts` (D75 moved the catalog
// out of the authenticator); the node-admin + node-config seams are new.

import { getV3Client } from './v3';
import { followersGroupId, getDiscoverGroupId } from './groups';
import { API_ORIGIN } from '../lib/origins';
import type { V3Document } from 'web10-npm';
import { parseProduct, type AdOffer, type AdProduct } from './types';

// ── The v3 ad model (ads-dissemination.md, D55) ─────────────────────────────

export interface AdItem {
  doc: V3Document;
  /** The ad's headline (D82) — an ad is a `posts` doc, so it carries the same
   *  optional `title` as any post. */
  title?: string;
  text: string;
  offer: AdOffer;
  status: 'active' | 'paused';
  /** The ad's creative media (doc_ids, or resolved refs on a read). */
  media_refs?: (string | Record<string, unknown>)[];
  /** `inline` (default) or `post` — how the attached ad renders. */
  format: 'inline' | 'post';
  /** album doc_ids this ad belongs to (from `album:<id>` tags) */
  albums: string[];
  /** The ad's product attributes (ads-october focus #2) — present when the ad
   *  advertises a product. The storefront + Products tab render these. */
  product?: AdProduct;
}

export interface AlbumItem {
  doc: V3Document;
  name: string;
  /** how many ads are in this album (computed) */
  adCount: number;
}

export interface PostItem {
  doc: V3Document;
  text: string;
  /** the pinned ad's doc_id, or '' when ad_mode is `none` */
  pinnedAdTarget: string;
}

export interface AdsCatalogData {
  ads: AdItem[];
  albums: AlbumItem[];
  posts: PostItem[];
}

// ── Leaf-value helpers (document-typing: {type, value} leaves) ─────────────

function leaf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) return String((value as { value?: unknown }).value ?? '');
  return '';
}

// ── Parsers ──

export function parseAd(doc: V3Document): AdItem {
  const body = (doc.body || {}) as Record<string, unknown>;
  const offerRaw = (body.offer || {}) as Record<string, unknown>;
  const tags = doc.tags || [];
  return {
    doc,
    title: leaf(body.title) || undefined,
    text: leaf(body.text),
    offer: {
      kind: leaf(offerRaw.kind),
      partner: leaf(offerRaw.partner),
      link: leaf(offerRaw.link),
      cta: leaf(offerRaw.cta),
      disclosure: leaf(offerRaw.disclosure),
    },
    status: body.status === 'paused' ? 'paused' : 'active',
    media_refs: (body.media_refs as (string | Record<string, unknown>)[]) || undefined,
    format: body.format === 'post' ? 'post' : 'inline',
    albums: tags.filter((t) => t.startsWith('album:')).map((t) => t.slice('album:'.length)),
    product: parseProduct(body),
  };
}

export function parseAlbum(doc: V3Document): AlbumItem {
  const body = (doc.body || {}) as Record<string, unknown>;
  return {
    doc,
    name: leaf(body.name) || 'Untitled album',
    adCount: 0,
  };
}

// ── Split one feed read into ads / albums / posts ───────────────────────────

export function splitCatalog(docs: V3Document[]): AdsCatalogData {
  const ads: AdItem[] = [];
  const albums: AlbumItem[] = [];
  const posts: PostItem[] = [];
  for (const doc of docs) {
    const tags = doc.tags || [];
    if (tags.includes('ad_album')) {
      albums.push(parseAlbum(doc));
    } else if (tags.includes('ad')) {
      ads.push(parseAd(doc));
    } else {
      posts.push({
        doc,
        text: leaf((doc.body || {}).text),
        pinnedAdTarget: doc.ad_target || '',
      });
    }
  }
  const countByAlbum = new Map<string, number>();
  for (const ad of ads) {
    for (const albumId of ad.albums) {
      countByAlbum.set(albumId, (countByAlbum.get(albumId) || 0) + 1);
    }
  }
  for (const album of albums) {
    album.adCount = countByAlbum.get(album.doc.doc_id) || 0;
  }
  return { ads, albums, posts };
}

// ── Offer builders (leaf-typed, D55) ────────────────────────────────────────

/**
 * Build the ad's product section as leaf-typed body (ads-october focus #2).
 * `number` leaves for price/commission/actuals/calibration (sortable), `text`
 * for target/name, a plain array of doc_ids for pics. `undefined` product →
 * no `product` key (a pure ad). Always emitted as `{}`-free: an absent product
 * means the key is omitted so an update can clear it (the node merges the body,
 * so we write `product: undefined`-free by only including it when present —
 * callers pass `null` to clear).
 */
export function buildProductBody(product?: AdProduct | null): Record<string, unknown> | undefined {
  if (!product) return undefined;
  const out: Record<string, unknown> = {};
  if (product.target) out.target = { type: 'text', value: product.target };
  if (product.name) out.name = { type: 'text', value: product.name };
  if (product.price !== undefined) out.price = { type: 'number', value: product.price };
  if (product.commission !== undefined) {
    out.commission = { type: 'number', value: product.commission };
    out.commission_is_percent = product.commission_is_percent !== false;
  }
  if (product.pics?.length) out.pics = product.pics;
  if (product.actuals !== undefined) out.actuals = { type: 'number', value: product.actuals };
  if (product.calibration !== undefined) out.calibration = { type: 'number', value: product.calibration };
  return Object.keys(out).length ? out : undefined;
}

/**
 * Build an ad's body (the `posts` doc tagged `ad`).
 *
 * `mediaRefs` — the ad's creative media (doc_ids). Present for a post-format
 * ad (full post, everything a post has) and optional for an inline ad (a
 * square thumbnail). Absent/empty → no `media_refs` key (a text-only ad).
 * `format` — `inline` (default) or `post`. Written to the body so the renderer
 * knows how to render the attached ad (app-owned, D75).
 * `product` — the ad's product section (ads-october focus #2). `undefined`/
 * `null` → no `product` key (a pure ad).
 */
export function buildOfferBody(
  offer: AdOffer,
  text: string,
  status: 'active' | 'paused',
  albumIds: string[],
  mediaRefs?: string[],
  format: 'inline' | 'post' = 'inline',
  title?: string,
  product?: AdProduct | null,
): Record<string, unknown> {
  const tags = ['ad', ...albumIds.map((id) => `album:${id}`)];
  const productBody = buildProductBody(product);
  return {
    // The post's two bodies of text (D82): the optional `title` headline + the
    // `text` caption. An ad is a `posts` doc, so it carries the same fields.
    title,
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
    format,
    // Always emitted (default `[]`) so an UPDATE can remove media — the node's
    // update merges the body, so an absent key would keep the old media_refs.
    media_refs: mediaRefs ?? [],
    // The product section (ads-october focus #2). Emitted only when present;
    // a `null`/`undefined` product writes `product: null` so an UPDATE clears
    // it (the node merges the body — an absent key would keep the old product).
    product: productBody ?? null,
  };
}

// ── Node ads (D57) — the operator's ad inventory ────────────────────────────

/** A node ad is a doc tagged `ad` + `node_ad` (web10-social shapes it as a posts doc). */
export function isNodeAd(doc: V3Document): boolean {
  return (doc.tags || []).includes('node_ad');
}

/** Filter a feed read down to the node ads (the operator's inventory). */
export function splitNodeAds(docs: V3Document[]): AdItem[] {
  return docs.filter(isNodeAd).map(parseAd);
}

/**
 * Build a node ad's body: the leaf-typed offer + the `node_ad` tag.
 * `mediaRefs` / `format` — same as `buildOfferBody` (a node ad can be inline
 * or post format, with media, exactly like a creator ad).
 */
export function buildNodeAdBody(
  offer: AdOffer,
  text: string,
  status: 'active' | 'paused',
  mediaRefs?: string[],
  format: 'inline' | 'post' = 'inline',
  title?: string,
  product?: AdProduct | null,
): Record<string, unknown> {
  const productBody = buildProductBody(product);
  return {
    title,
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
    format,
    // Always emitted (default `[]`) so an UPDATE can remove media.
    media_refs: mediaRefs ?? [],
    // The product section (ads-october focus #2) — node ads can carry it too.
    product: productBody ?? null,
  };
}

/**
 * Create a node ad (the operator's inventory) on the discover group. The
 * unified ad form's "Node ad" scope (the node admin can run an ad as a personal
 * ad OR a node ad from one surface). No albums (a node ad is the operator's
 * inventory, not a creator's catalog).
 */
export async function createNodeAd(
  offer: AdOffer,
  text: string,
  status: 'active' | 'paused',
  mediaRefs?: string[],
  format: 'inline' | 'post' = 'inline',
  product?: AdProduct | null,
): Promise<V3Document> {
  const w = getV3Client();
  return w.create('posts', buildNodeAdBody(offer, text, status, mediaRefs, format, undefined, product), { groups: [getDiscoverGroupId()] });
}

/**
 * Update an existing ad (the Edit flow, ad-improvements.md). Same `doc_id` —
 * an update is a new version, so any post that has this ad pinned keeps
 * pointing at it and the new creative/offer/format shows immediately.
 */
export async function updateAd(
  ad: AdItem,
  offer: AdOffer,
  text: string,
  status: 'active' | 'paused',
  albumIds: string[],
  mediaRefs?: string[],
  format: 'inline' | 'post' = 'inline',
  title?: string,
  product?: AdProduct | null,
): Promise<V3Document> {
  const w = getV3Client();
  const body = buildOfferBody(offer, text, status, albumIds, mediaRefs, format, title, product);
  return w.update(ad.doc.doc_id, body);
}

/**
 * Update an existing node ad (the Edit flow — node ads have the same
 * editability as creator ads). Same `doc_id` — an update is a new version, so
 * the read-time attach (`attach_node_ads`) picks up the new creative/offer/
 * format on the next read. No albums (a node ad is the operator's inventory,
 * not a creator's catalog).
 */
export async function updateNodeAd(
  ad: AdItem,
  offer: AdOffer,
  text: string,
  status: 'active' | 'paused',
  mediaRefs?: string[],
  format: 'inline' | 'post' = 'inline',
  title?: string,
  product?: AdProduct | null,
): Promise<V3Document> {
  const w = getV3Client();
  const body = buildNodeAdBody(offer, text, status, mediaRefs, format, title, product);
  return w.update(ad.doc.doc_id, body);
}

// ── The creator's catalog (the owner's own posts over their followers group) ─

/**
 * Read the creator's ads + albums + posts (the catalog). One read over the
 * followers group, split client-side (a creator's own posts are a small,
 * bounded set). Returns empty on no token / read failure (the surface shows
 * its empty state, not an error — a fresh creator has no followers group yet).
 */
export async function readMyCatalog(): Promise<AdsCatalogData> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return { ads: [], albums: [], posts: [] };
  const username = token.username;
  const provider = token.provider;
  const docs = await w.read('posts', { groups: [followersGroupId(username, provider)] });
  return splitCatalog(docs || []);
}

/**
 * Read another user's ads (the storefront / Products tab, ads-october focus #1).
 * One read over THAT user's followers group, split client-side. Returns the
 * full catalog (ads + albums + posts); the caller filters to product ads.
 *
 * Access is group-gated (I3): the owner + the creator's followers can read the
 * followers group's `posts` service; an anon / non-follower read 403s → we
 * return empty (the storefront shows its "follow to browse" state, not an
 * error). No new grants, no node surface — the storefront is a *read + render*
 * of the catalog that's already there (D60).
 */
export async function readUserAds(username: string, provider?: string): Promise<AdsCatalogData> {
  const w = getV3Client();
  const token = w.readToken();
  const prov = provider || token?.provider;
  if (!prov) return { ads: [], albums: [], posts: [] };
  const docs = await w.read('posts', { groups: [followersGroupId(username, prov)] });
  return splitCatalog(docs || []);
}

/**
 * The storefront's product grid (ads-october focus #1): the creator's ads that
 * carry a product section, organized by album. The "here's everything I
 * recommend" destination — the public face of the Products tab.
 */
export async function readStorefront(username: string, provider?: string): Promise<AdItem[]> {
  const { ads } = await readUserAds(username, provider);
  return ads.filter((ad) => ad.product);
}

/**
 * Ensure the creator's followers group exists, returning its ID. The catalog
 * read + ad writes both attach to it; a fresh creator has none yet.
 */
export async function ensureFollowersGroup(username: string, provider?: string): Promise<string> {
  const w = getV3Client();
  const groupId = followersGroupId(username, provider);
  try {
    await w.getGroup(groupId);
    return groupId;
  } catch {
    await w.createGroup(
      'followers',
      'open',
      [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
        { name: 'member', services: ['posts', 'comments'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      ],
      [{ member_key: username, role: 'owner' }],
    );
    return groupId;
  }
}

// ── Node ads (the operator's inventory, the discover group) ─────────────────

/** Read the node ads (the operator's inventory) from the discover group. */
export async function readNodeAds(): Promise<AdItem[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return [];
  const docs = await w.read('posts', { groups: [getDiscoverGroupId()], limit: 200 });
  return splitNodeAds(docs || []);
}

// ── Node-admin detection + node config (D75) ────────────────────────────────

/**
 * Is the current user the node admin? Reuses `POST /am_admin` (no new
 * endpoint) — the same check the authenticator's `I.checkAdmin()` uses.
 * `false` on no token / failure (the Node section + nav icon stay hidden).
 */
export async function checkNodeAdmin(): Promise<boolean> {
  const raw = readRawToken();
  if (!raw) return false;
  try {
    const resp = await fetch(`${API_ORIGIN}/am_admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: raw }),
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { admin?: boolean };
    return !!data?.admin;
  } catch {
    return false;
  }
}

/** The node's effective config (admin). Throws on non-admin (403). */
export async function getNodeConfig(): Promise<Record<string, unknown>> {
  const w = getV3Client();
  const raw = readRawToken();
  if (!raw) throw new Error('not signed in');
  const resp = await fetch(`${API_ORIGIN}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: raw }),
  });
  if (!resp.ok) throw new Error(`config ${resp.status}`);
  return (await resp.json()) as Record<string, unknown>;
}

/** Set the node-ad density (admin). Writes `node_ad_percentage` to node_config. */
export async function saveNodeAdPercentage(pct: number): Promise<void> {
  const raw = readRawToken();
  if (!raw) throw new Error('not signed in');
  const resp = await fetch(`${API_ORIGIN}/config/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: { token: raw }, update: { node_ad_percentage: pct } }),
  });
  if (!resp.ok) {
    let detail = `config/update ${resp.status}`;
    try {
      const d = (await resp.json()) as { detail?: string };
      if (d?.detail) detail = d.detail;
    } catch { /* keep the status */ }
    throw new Error(detail);
  }
}

/**
 * Set the node-ad overwrite flag (admin). Writes `node_ad_overwrite` to
 * node_config — when true, a node ad replaces the creator's ad on the same post
 * (instead of both showing). The companion to `saveNodeAdPercentage`.
 */
export async function saveNodeAdOverwrite(overwrite: boolean): Promise<void> {
  const raw = readRawToken();
  if (!raw) throw new Error('not signed in');
  const resp = await fetch(`${API_ORIGIN}/config/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: { token: raw }, update: { node_ad_overwrite: overwrite } }),
  });
  if (!resp.ok) {
    let detail = `config/update ${resp.status}`;
    try {
      const d = (await resp.json()) as { detail?: string };
      if (d?.detail) detail = d.detail;
    } catch { /* keep the status */ }
    throw new Error(detail);
  }
}

/** The raw JWT from the token cookie (the /am_admin + /config bodies need it). */
function readRawToken(): string | null {
  try {
    const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
