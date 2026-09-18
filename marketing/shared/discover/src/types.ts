// The shared discover card's data model (D73). These are the shapes the
// presentational card consumes — the apps map their own data-layer records
// onto these. Keeping them here (not in an app's data layer) is what lets one
// card serve both web10-social and marketing-ui.

/** A transcoded rendition (the node preserves the source ratio across them). */
export interface TranscodingVariant {
  width: number;
  height: number;
  fps?: number;
  bitrate_kbps?: number;
  codec?: string;
  duration_seconds?: number;
}

/**
 * The media doc's `transcoding_settings` (D44). On a read, the API carries it
 * into the resolved media ref and mints a per-reader `manifest_url` (a 10-min
 * sig bound to (reader, doc, hls prefix)). Path-only URL: the consumer
 * prepends its API origin.
 */
export interface TranscodingSettings {
  enabled?: boolean;
  status?: 'processing' | 'done' | 'failed';
  variants?: TranscodingVariant[];
  manifest_url?: string;
  error?: string;
}

/**
 * A media item as the card's player consumes it (the social app's MediaRecord
 * shape, narrowed to the fields the player + carousel read). `url` is the raw
 * source file (HEVC/AV1 — undecodable in mobile Chrome); a transcoded video
 * plays through `transcoding_settings.manifest_url` (H.264/AAC HLS) instead.
 */
export interface MediaItem {
  _id?: string;
  url: string;
  object_key?: string;
  created_at?: string;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  duration_seconds?: number;
  thumbnail_url?: string;
  alt_text?: string;
  transcoding_settings?: TranscodingSettings;
}

/** A comment as the thread renders it (the social app's CommentRecord shape).
 *
 * The threading model (comments.md, the Facebook shape): `parent_id` is set on
 * a reply (the parent comment's doc_id); a top-level comment has none. The
 * reader is PAGED — it returns one page of top-level comments (the server
 * filters `ref_value = postId`, orders by `created_at`, applies the keyset
 * cursor) + a `nextCursor` for "view more comments". A comment's replies are
 * a separate paged read (`readReplies`, the "view more replies" page).
 * `likeCount` / `likedByMe` are resolved by the app from the reactions read;
 * absent → the thread renders no like UI.
 */
export interface CommentItem {
  _id?: string;
  text: string;
  author_username?: string;
  author_provider?: string;
  created_at: string;
  /** Set on a reply: the parent comment's doc_id. */
  parent_id?: string;
  /** The comment's like count (the app resolves it; absent → no like UI). */
  likeCount?: number;
  /** Whether the reader liked this comment (the app resolves it). */
  likedByMe?: boolean;
}

/** One keyset-cursor page of comments + the cursor for the next page (null
 *  when the thread is exhausted). `replyCounts` (optional, the social app
 *  provides it) maps each top-level comment's doc_id to its total reply
 *  count — the thread uses it to pre-fetch each comment's first reply page
 *  and to show "view more replies" only where there is more. Absent (e.g.
 *  the marketing public-ledger reader, which returns the whole flat
 *  conversation) → the thread builds the tree from the returned comments
 *  alone. */
export interface CommentPageResult {
  comments: CommentItem[];
  nextCursor: string | null;
  replyCounts?: Record<string, number>;
}

/** The top-level comment reader the thread calls (injected by the app — the
 *  data seam). Paged: returns one page + a `nextCursor` for "view more
 *  comments". */
export type ReadComments = (
  postId: string,
  groups?: string[],
  opts?: { cursor?: string; limit?: number },
) => Promise<CommentPageResult>;

/** The reply reader the thread calls for "view more replies" (injected; the
 *  server filters `ref_value = commentId`). Paged like ReadComments. */
export type ReadReplies = (
  commentId: string,
  groups?: string[],
  opts?: { cursor?: string; limit?: number },
) => Promise<CommentPageResult>;

/** The comment writer the thread calls (injected; absent in `remote` mode).
 * `parentId` present = a reply to that comment (refs the parent); absent =
 * top-level (refs the post). */
export type CreateComment = (args: {
  postId: string;
  text: string;
  parentId?: string;
  postAuthor?: string;
  postService?: string;
  groups?: string[];
}) => Promise<CommentItem | null>;

/**
 * The discover card's post. The apps map their feed/discover records onto this.
 * `id` is the post's doc_id (the comment/reaction target).
 */
export interface DiscoverPost {
  id: string;
  author: string;
  author_username?: string;
  /** The display name (the marketing card's post.name; the social app's
   *  profile display_name). Falls back to the username-derived name. */
  display_name?: string;
  text?: string;
  tags?: string[];
  created_at: string;
  likes?: number;
  dislikes?: number;
  comments?: number;
  reposts?: number;
  score?: number;
  media?: MediaItem[];
}

