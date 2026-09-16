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

/** A comment as the thread renders it (the social app's CommentRecord shape). */
export interface CommentItem {
  _id?: string;
  text: string;
  author_username?: string;
  author_provider?: string;
  created_at: string;
}

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
  comments?: number;
  reposts?: number;
  score?: number;
  media?: MediaItem[];
}

/** The comment reader the thread calls (injected by the app — the data seam). */
export type ReadComments = (postId: string, groups?: string[]) => Promise<CommentItem[]>;

/** The comment writer the thread calls (injected; absent in `remote` mode). */
export type CreateComment = (args: {
  postId: string;
  text: string;
  postAuthor?: string;
  postService?: string;
  groups?: string[];
}) => Promise<CommentItem | null>;
