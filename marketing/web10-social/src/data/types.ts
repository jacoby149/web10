// Types that mirror the conventions schemas in marketing-ui/public/docs/schemas/
// These are the canonical shapes the data layer reads and writes.

export type Origin = 'web10' | 'instagram' | 'facebook' | 'youtube' | 'twitter' | 'tiktok' | 'other';

export type Visibility = 'public' | 'friends' | 'private';

// ── posts ───────────────────────────────────────────────────────────────────

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
  media_refs?: string[];
  created_at: string;
  updated_at?: string;
  origin?: Origin;
  origin_id?: string;
  visibility?: Visibility;
  location?: PostLocation;
  tags?: string[];
  mentions?: PostMention[];
  encrypted?: boolean;
}

// ── media ───────────────────────────────────────────────────────────────────

export interface MediaRecord {
  _id?: string;
  url: string;
  created_at: string;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  duration_seconds?: number;
  thumbnail_url?: string;
  hls_manifest_url?: string;
  caption?: string;
  alt_text?: string;
  origin?: Origin;
  origin_id?: string;
  encrypted?: boolean;
}

export interface MediaUploadRequest {
  file: File;
  onProgress?: (progress: number) => void;
}

// ── profile ─────────────────────────────────────────────────────────────────

export interface ProfileRecord {
  _id?: string;
  display_name?: string;
  avatar_ref?: string;
  // Creator-page banner (design.md §10 level-up). Not yet in
  // marketing-ui/public/docs/schemas/profile.json but that schema declares
  // additionalProperties: true, so this is forward-compatible.
  banner_ref?: string;
  bio?: string;
  website?: string;
  location?: string;
  updated_at?: string;
}

// ── contacts ────────────────────────────────────────────────────────────────

export interface ContactRecord {
  _id?: string;
  username: string;
  provider: string;
  display_name?: string;
  labels?: string[];
  added_at?: string;
  note?: string;
}

// ── follows ─────────────────────────────────────────────────────────────────

export type FollowStatus = 'pending' | 'active' | 'rejected' | 'blocked';

export interface FollowRecord {
  _id?: string;
  username: string;
  provider: string;
  status: FollowStatus;
  followed_at?: string;
  notify?: boolean;
}

// ── comments ────────────────────────────────────────────────────────────────

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

// ── reactions ───────────────────────────────────────────────────────────────

export type ReactionTargetService = 'posts' | 'comments';

export interface ReactionRecord {
  _id?: string;
  target_service: ReactionTargetService;
  target_id: string;
  type: string;
  created_at: string;
  author_username?: string;
  author_provider?: string;
}

// ── inbox (feed) ────────────────────────────────────────────────────────────

export interface InboxRecord {
  _id?: string;
  author_username: string;
  author_provider: string;
  post_id: string;
  delivered_at: string;
  post_body?: Record<string, unknown>;
  read?: boolean;
  score?: number;
  origin?: Origin;
}

// ── dms (records-based, lives in a per-conversation service) ────────────────

export interface DmRecord {
  _id?: string;
  message: string;
  sent_at: string;
  sender_username: string;
  sender_provider: string;
  recipient_username: string;
  recipient_provider: string;
  media_refs?: string[];
  encrypted?: boolean;
}

// ── Feed sort options ───────────────────────────────────────────────────────

export type FeedSort = 'newest' | 'oldest' | 'most_reacted';
