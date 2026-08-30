import type { V3Document } from './v3';
import type { KnobState } from '@/lib/powerMean';

// ── V3 document mapping ────────────────────────────────────────────────────
// The v3 API returns V3Document (doc_id, author_key, collection_name, body,
// ref_value, tags, created_at, updated_at, groups). The app-level types
// (V3Post, V3Comment, etc.) are the shapes the UI components expect.
// The `fromV3Doc` helpers extract the typed body from the V3Document envelope.

// ── Post ────────────────────────────────────────────────────────────────────

export type Origin = 'web10' | 'instagram' | 'facebook' | 'youtube' | 'twitter' | 'tiktok' | 'other';
export type Visibility = 'public' | 'friends' | 'private';

export interface PostLocation {
  name?: string;
  lat?: number;
  lon?: number;
}

export interface PostMention {
  username: string;
  provider: string;
}

export interface PostRecord {
  _id?: string;
  text?: string;
  // A media ref is either a bare doc_id (string — the write path, or a
  // pre-resolution read) or a resolved object (the API read path's
  // resolve_media_urls rewrites media_refs to {doc_id, object_key,
  // mime_type, filename, size_bytes, read_url} with a fresh presigned
  // read_url on every read).
  media_refs?: (string | ResolvedMediaRef)[];
  created_at: string;
  updated_at?: string;
  origin?: Origin;
  origin_id?: string;
  visibility?: Visibility;
  location?: PostLocation;
  tags?: string[];
  mentions?: PostMention[];
  encrypted?: boolean;
  // Author info extracted from V3Document.author_key — needed by DiscoverScreen, FeedScreen, etc.
  author_username?: string;
  author_provider?: string;
  // Engagement counts (populated by discover/feed queries)
  likes?: number;
  comments?: number;
  reposts?: number;
  score?: number;
  // The v3 pinned ad (ads-dissemination.md): the read serves a pinned post with
  // its ad inline; the ad block renders it under the post.
  ad?: AdRecord;
  // Aliases for backward compat with DiscoveryPost
  author?: string;
  provider?: string;
  post_id?: string;
}

export function fromV3DocToPost(doc: V3Document): PostRecord {
  const body = doc.body as Record<string, unknown>;
  const username = extractUsername(doc.author_key);
  const provider = extractProvider(doc.author_key);
  return {
    _id: doc.doc_id,
    text: (body.text as string) || undefined,
    media_refs: (body.media_refs as string[]) || undefined,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    origin: (body.origin as Origin) || undefined,
    origin_id: (body.origin_id as string) || undefined,
    visibility: (body.visibility as Visibility) || undefined,
    location: (body.location as PostLocation) || undefined,
    tags: doc.tags || (body.tags as string[]) || undefined,
    mentions: (body.mentions as PostMention[]) || undefined,
    encrypted: body.encrypted as boolean,
    author_username: username,
    author_provider: provider,
    // The v3 pinned ad (ads-dissemination.md): the read serves a pinned post
    // with its ad inline under `ad` (I3-checked). Mapped to an AdRecord for
    // the ad block renderer.
    ad: doc.ad ? fromV3DocToAd(doc.ad) : undefined,
    // Backward compat aliases for DiscoveryPost consumers
    author: username,
    provider,
    post_id: doc.doc_id,
  };
}

// ── Ad (the v3 ad object, D55) ──────────────────────────────────────────────
// An ad is a `posts` doc tagged `ad`: the creative (text + media_refs) plus a
// leaf-typed `offer` (the link that pays) plus a `status`. The read serves a
// pinned post with its ad inline (`doc.ad`); the app renders it as an ad block
// (creative + offer + disclosure — the disclosure is never hidden).

export interface AdOffer {
  kind?: string;
  partner?: string;
  link?: string;
  cta?: string;
  disclosure?: string;
}

export interface AdRecord {
  _id?: string;
  text?: string;
  media_refs?: string[];
  offer?: AdOffer;
  status?: 'active' | 'paused';
  author_username?: string;
  /** album doc_ids this ad belongs to (from its `album:<id>` tags) */
  albums?: string[];
}

/** Extract a leaf-typed value: {type, value} → value, string → itself. */
function leafValue(v: unknown): string | undefined {
  if (typeof v === 'string') return v || undefined;
  if (v && typeof v === 'object' && 'value' in v) {
    const s = String((v as { value?: unknown }).value ?? '') || undefined;
    return s;
  }
  return undefined;
}

export function fromV3DocToAd(doc: V3Document): AdRecord {
  const body = doc.body as Record<string, unknown>;
  const offerRaw = (body.offer || {}) as Record<string, unknown>;
  const tags = doc.tags || [];
  return {
    _id: doc.doc_id,
    text: (body.text as string) || undefined,
    media_refs: (body.media_refs as string[]) || undefined,
    offer: {
      kind: leafValue(offerRaw.kind),
      partner: leafValue(offerRaw.partner),
      link: leafValue(offerRaw.link),
      cta: leafValue(offerRaw.cta),
      disclosure: leafValue(offerRaw.disclosure),
    },
    status: body.status === 'paused' ? 'paused' : 'active',
    author_username: extractUsername(doc.author_key),
    albums: tags.filter((t) => t.startsWith('album:')).map((t) => t.slice('album:'.length)),
  };
}

// ── Media ───────────────────────────────────────────────────────────────────

export interface MediaRecord {
  _id?: string;
  url: string;
  object_key?: string;
  created_at: string;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  duration_seconds?: number;
  thumbnail_url?: string;
  thumbnail_object_key?: string;
  hls_manifest_url?: string;
  caption?: string;
  alt_text?: string;
  origin?: Origin;
  origin_id?: string;
  encrypted?: boolean;
}

/**
 * A media ref as returned by the API read path (`resolve_media_urls`):
 * the post's `media_refs` arrive pre-resolved with a fresh presigned
 * `read_url` (minted from the metadata's object_key on every read).
 */
export interface ResolvedMediaRef {
  doc_id?: string;
  object_key?: string | null;
  mime_type?: string | null;
  filename?: string | null;
  size_bytes?: number | null;
  read_url?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  thumbnail_url?: string | null;
}

/** The doc_id a media ref addresses — strings are doc_ids, resolved objects carry it. */
export function mediaRefId(ref: string | ResolvedMediaRef): string {
  return typeof ref === 'string' ? ref : ref.doc_id || '';
}

/** Map an API-resolved media ref (read path) to a MediaRecord. */
export function fromResolvedMediaRef(r: ResolvedMediaRef): MediaRecord {
  return {
    _id: r.doc_id || undefined,
    url: r.read_url || '',
    object_key: r.object_key || undefined,
    created_at: '',
    mime_type: r.mime_type || undefined,
    size_bytes: r.size_bytes || undefined,
    width: r.width || undefined,
    height: r.height || undefined,
    duration_seconds: r.duration_seconds || undefined,
    thumbnail_url: r.thumbnail_url || undefined,
  };
}

export function fromV3DocToMedia(doc: V3Document): MediaRecord {
  const body = doc.body as Record<string, unknown>;
  return {
    _id: doc.doc_id,
    url: (body.url as string) || '',
    object_key: (body.object_key as string) || undefined,
    created_at: doc.created_at,
    mime_type: (body.mime_type as string) || undefined,
    size_bytes: (body.size_bytes as number) || undefined,
    width: (body.width as number) || undefined,
    height: (body.height as number) || undefined,
    duration_seconds: (body.duration_seconds as number) || undefined,
    thumbnail_url: (body.thumbnail_url as string) || undefined,
    thumbnail_object_key: (body.thumbnail_object_key as string) || undefined,
    hls_manifest_url: (body.hls_manifest_url as string) || undefined,
    caption: (body.caption as string) || undefined,
    alt_text: (body.alt_text as string) || undefined,
    origin: (body.origin as Origin) || undefined,
    origin_id: (body.origin_id as string) || undefined,
    encrypted: body.encrypted as boolean,
  };
}

export interface MediaUploadRequest {
  file: File;
  onProgress?: (progress: number) => void;
  width?: number;
  height?: number;
  durationSeconds?: number;
  thumbnailFile?: File;
  altText?: string;
  service?: 'media' | 'public_media';
}

// ── Profile ─────────────────────────────────────────────────────────────────

export interface ProfileRecord {
  _id?: string;
  display_name?: string;
  avatar_ref?: string;
  banner_ref?: string;
  bio?: string;
  website?: string;
  location?: string;
  updated_at?: string;
}

export function fromV3DocToProfile(doc: V3Document): ProfileRecord {
  const body = doc.body as Record<string, unknown>;
  return {
    _id: doc.doc_id,
    display_name: (body.display_name as string) || undefined,
    avatar_ref: (body.avatar_ref as string) || undefined,
    banner_ref: (body.banner_ref as string) || undefined,
    bio: (body.bio as string) || undefined,
    website: (body.website as string) || undefined,
    location: (body.location as string) || undefined,
    updated_at: doc.updated_at,
  };
}

// ── Comments (refs) ─────────────────────────────────────────────────────────

export interface CommentRecord {
  _id?: string;
  post_id: string;
  text: string;
  created_at: string;
  updated_at?: string;
  parent_id?: string;
  author_username?: string;
  author_provider?: string;
  origin?: Origin;
  origin_id?: string;
}

export function fromV3DocToComment(doc: V3Document): CommentRecord {
  const body = doc.body as Record<string, unknown>;
  return {
    _id: doc.doc_id,
    post_id: doc.ref_value || (body.post_id as string) || '',
    text: (body.text as string) || '',
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    parent_id: (body.parent_id as string) || undefined,
    author_username: extractUsername(doc.author_key),
    author_provider: extractProvider(doc.author_key),
    origin: (body.origin as Origin) || undefined,
    origin_id: (body.origin_id as string) || undefined,
  };
}

// ── Reactions (refs) ────────────────────────────────────────────────────────

export interface ReactionRecord {
  _id?: string;
  target_service: 'posts' | 'comments';
  target_id: string;
  type: string;
  created_at: string;
  author_username?: string;
  author_provider?: string;
}

export function fromV3DocToReaction(doc: V3Document): ReactionRecord {
  const body = doc.body as Record<string, unknown>;
  return {
    _id: doc.doc_id,
    target_service: (body.target_service as 'posts' | 'comments') || 'posts',
    target_id: doc.ref_value || (body.target_id as string) || '',
    type: (body.type as string) || 'like',
    created_at: doc.created_at,
    author_username: extractUsername(doc.author_key),
    author_provider: extractProvider(doc.author_key),
  };
}

// ── DMs (group-based) ───────────────────────────────────────────────────────

export interface DmRecipient {
  username: string;
  provider: string;
}

export interface DmRecord {
  _id?: string;
  message: string;
  sent_at: string;
  updated_at?: string;
  sender_username: string;
  sender_provider: string;
  recipient_username: string;
  recipient_provider: string;
  media_refs?: string[];
  encrypted?: boolean;
  subject?: string;
  to?: DmRecipient[];
  cc?: DmRecipient[];
  bcc?: DmRecipient[];
}

export function fromV3DocToDm(doc: V3Document): DmRecord {
  const body = doc.body as Record<string, unknown>;
  return {
    _id: doc.doc_id,
    message: (body.message as string) || '',
    sent_at: doc.created_at,
    updated_at: doc.updated_at,
    sender_username: extractUsername(doc.author_key) || (body.sender_username as string) || '',
    sender_provider: extractProvider(doc.author_key) || (body.sender_provider as string) || '',
    recipient_username: (body.recipient_username as string) || '',
    recipient_provider: (body.recipient_provider as string) || '',
    media_refs: (body.media_refs as string[]) || undefined,
    encrypted: body.encrypted as boolean,
    subject: (body.subject as string) || undefined,
    to: (body.to as DmRecipient[]) || undefined,
    cc: (body.cc as DmRecipient[]) || undefined,
    bcc: (body.bcc as DmRecipient[]) || undefined,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract username from author_key.
 * V3 author_key format: "web10.app/users/username" or "provider/username"
 */
export function extractUsername(authorKey: string): string {
  const parts = authorKey.split('/');
  return parts[parts.length - 1] || authorKey;
}

/**
 * Extract provider from author_key.
 */
export function extractProvider(authorKey: string): string {
  const parts = authorKey.split('/');
  if (parts.length >= 2) {
    // "web10.app/users/username" → "web10.app"
    // "provider/username" → "provider"
    return parts[0];
  }
  return 'web10';
}

// ── Feed sort ───────────────────────────────────────────────────────────────

export type FeedSort = 'newest' | 'oldest' | 'most_reacted';
export type DiscoverSort = 'recent' | 'trending';

// ── Settings ────────────────────────────────────────────────────────────────

export interface AppSettings {
  defaultVisibility?: 'public' | 'private';
  /**
   * Real-time messages (WebRTC P2P). When on, the app opens a P2P peer on
   * sign-in: messages are delivered instantly over a data channel when both
   * parties are online, and the user shows as online. When off, no P2P peer
   * is opened — messages still work via CRUD (poll/read), but there's no
   * instant nudge and the user shows as offline. Default: on.
   */
  p2pEnabled?: boolean;
  /** The feed's knob tuning (the D36 power-mean state) — persisted so the
   *  app remembers how the user tuned their feed across sessions/devices. */
  feedKnobs?: KnobState;
}

// ── Legacy types (backward compat) ──────────────────────────────────────────

export type CrmStatus = 'green' | 'yellow' | 'red';

export interface ContactRecord {
  _id?: string;
  username: string;
  provider: string;
  display_name?: string;
  labels?: string[];
  added_at?: string;
  note?: string;
  spam_flagged?: boolean;
  crm_status?: CrmStatus;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  links?: string;
  custom_fields?: Record<string, string>;
}

export type FollowStatus = 'pending' | 'active' | 'rejected' | 'blocked';

export interface FollowRecord {
  _id?: string;
  username: string;
  provider: string;
  status: FollowStatus;
  followed_at?: string;
  notify?: boolean;
}

export interface InboxRecord {
  _id?: string;
  author_username: string;
  author_provider: string;
  post_id: string;
  delivered_at: string;
  post_body?: Record<string, unknown>;
  read?: boolean;
  score?: number;
  origin?: string;
}