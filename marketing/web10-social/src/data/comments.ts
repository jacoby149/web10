import { getV3Client } from './v3';
import { getDiscoverGroupId } from './groups';
import { fromV3DocToComment, fromResolvedMediaRef, extractUsername, type CommentRecord, type MediaRecord, type ResolvedMediaRef } from './types';
import { sendNotification } from './notifications';
import { readPostById, uploadMedia } from './posts';
import { processImage, generateThumbnail, validateMedia } from '@/lib/mediaProcessing';

// ── Comments data layer (v3) ─────────────────────────────────────────────────
// The threading model (comments.md) — the Facebook/Instagram shape:
//
//   top-level:  ref_value = post-123   body = { text, post_id, … }
//   reply:      ref_value = cm-456     body = { text, post_id, parent_id: cm-456, … }
//
// A comment's `ref_value` is its PARENT — the post for a top-level comment,
// the parent comment for a reply. That is what makes each level an independent
// server page: top-level comments page on `ref = post_id`, a comment's replies
// page on `ref = comment_id`. Both are keyset-cursor paged on `created_at`
// (tie-broken by `doc_id`), so a 10k-comment post opens in one bounded read
// and grows on demand ("view more comments" / "view more replies").
//
// The cost (comments.md): the post's TOTAL comment count is no longer one
// `GROUP BY ref_value` (replies don't ref the post). The top-level count is
// still exact + cheap; the total is top-level + summed reply counts, or a
// maintained counter at scale. The count is decoupled from the read.

/** A keyset cursor page of comments + the cursor for the next page (null when
 *  the page returned fewer than `limit` rows — the thread is exhausted). */
export interface CommentPage {
  comments: CommentRecord[];
  nextCursor: string | null;
}

/** Build the keyset cursor from a page's last row: "created_at|doc_id". */
function pageCursor(last: CommentRecord | undefined, page: CommentRecord[], limit: number): string | null {
  if (!page.length || page.length < limit) return null;
  const tail = last ?? page[page.length - 1];
  if (!tail._id || !tail.created_at) return null;
  return `${tail.created_at}|${tail._id}`;
}

/**
 * Read one page of a post's TOP-LEVEL comments (the server filters
 * `ref_value = postId`, orders by `created_at`, applies the keyset cursor).
 */
export async function readComments(
  postId: string,
  groups?: string[],
  opts: { cursor?: string; limit?: number; order?: 'asc' | 'desc' } = {},
): Promise<CommentPage> {
  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  const limit = opts.limit ?? 20;
  const docs = await w.read('comments', {
    groups: targetGroups,
    ref: postId,
    limit,
    cursor: opts.cursor,
    order: opts.order ?? 'asc',
  });
  const comments = docs.map(fromV3DocToComment);
  return { comments, nextCursor: pageCursor(undefined, comments, limit) };
}

/**
 * Read one page of a comment's REPLIES (the server filters
 * `ref_value = commentId` — the Facebook "view more replies" page).
 */
export async function readReplies(
  commentId: string,
  groups?: string[],
  opts: { cursor?: string; limit?: number; order?: 'asc' | 'desc' } = {},
): Promise<CommentPage> {
  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  const limit = opts.limit ?? 5;
  const docs = await w.read('comments', {
    groups: targetGroups,
    ref: commentId,
    limit,
    cursor: opts.cursor,
    order: opts.order ?? 'asc',
  });
  const comments = docs.map(fromV3DocToComment);
  return { comments, nextCursor: pageCursor(undefined, comments, limit) };
}

/**
 * Count a post's TOP-LEVEL comments (the server's `GROUP BY ref_value` —
 * exact, no cap). The post's TOTAL (top-level + replies) is this plus the
 * sum of each comment's reply count; the thread computes it from the pages it
 * has loaded (comments.md: the count is decoupled from the read).
 */
export async function countComments(postId: string, groups?: string[]): Promise<number> {
  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  const counts = await w.readRefCounts('comments', { groups: targetGroups, ref: postId });
  return counts[postId] || 0;
}

/**
 * Count replies for a set of comments in one server call (`GROUP BY
 * ref_value` over the comments' doc_ids — a reply's `ref_value` is its
 * parent). The thread uses this to know which loaded comments have replies
 * (so it fetches their first page + shows "view more replies" only where
 * there is more). Returns `{ commentId: replyCount }`.
 */
export async function countRepliesByComment(
  commentIds: string[],
  groups?: string[],
): Promise<Record<string, number>> {
  if (!commentIds.length) return {};
  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  const counts = await w.readRefCounts('comments', { groups: targetGroups, ref: commentIds });
  return counts;
}

/**
 * Create a new comment on a post, or a reply to a comment.
 *
 * The write model (comments.md): a top-level comment writes
 * `ref_value = post_id`; a reply (`parent_id` set) writes
 * `ref_value = parent_id` (the parent comment) so "view more replies" is a
 * clean server page. Both keep `body.post_id` (attribution + the nudge path)
 * and a reply keeps `body.parent_id` (the client tree + the nudge target).
 */
export async function createComment(
  comment: Omit<CommentRecord, '_id'>,
  groupsOrPostAuthor?: string[] | string,
  postService?: string,
): Promise<CommentRecord> {
  const groups = Array.isArray(groupsOrPostAuthor) ? groupsOrPostAuthor : undefined;
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const body: Record<string, unknown> = {
    text: comment.text,
    post_id: comment.post_id,
    parent_id: comment.parent_id,
    author_username: token.username,
    author_provider: token.provider,
    origin: comment.origin,
    origin_id: comment.origin_id,
    // The comment's photos (comments.md): media doc_ids, the post's own
    // convention. The node's read path resolves them to presigned URLs.
    media_refs: comment.media_refs?.length ? comment.media_refs : undefined,
  };

  const targetGroups = groups || [getDiscoverGroupId()];
  // ref_value is the PARENT (comments.md): the post for a top-level comment,
  // the parent comment for a reply. Without it the comment is orphaned
  // (ref_value="" → the ref read never finds it).
  const refValue = comment.parent_id || comment.post_id;
  const doc = await w.create('comments', body, { groups: targetGroups, ref_value: refValue });
  // The write side (D69): nudge the right author (best-effort, fire-and-forget —
  // a resolve failure never affects the comment). A reply (parent_id set) →
  // the comment author; a top-level comment → the post author. The target
  // provider is the NODE's provider (token.provider), NOT the derived
  // author_provider: v3 author_keys are bare usernames, so extractProvider
  // falls back to the 'web10' default — a peer id that doesn't exist, and the
  // nudge silently never lands. v3 is same-node, so the author is on this node.
  if (comment.parent_id) {
    w.readById(comment.parent_id, 'comments')
      .then((c) => {
        const author = extractUsername(c.author_key);
        if (author) {
          sendNotification(
            { username: author, provider: token.provider },
            { type: 'reply', from: token.username, ref_doc_id: comment.parent_id },
          );
        }
      })
      .catch(() => {});
  } else {
    readPostById(comment.post_id)
      .then((post) => {
        if (post?.author_username) {
          sendNotification(
            { username: post.author_username, provider: token.provider },
            { type: 'comment', from: token.username, ref_doc_id: comment.post_id },
          );
        }
      })
      .catch(() => {});
  }
  return fromV3DocToComment(doc);
}

/**
 * Update a comment by ID.
 * @param id - comment doc_id
 * @param updates - fields to update
 * @param _postAuthor - v2 compat, ignored
 * @param _postService - v2 compat, ignored
 */
export async function updateComment(
  id: string,
  updates: Partial<CommentRecord>,
  _postAuthor?: string,
  _postService?: string,
): Promise<CommentRecord> {
  const w = getV3Client();
  const body: Record<string, unknown> = {};
  if (updates.text !== undefined) body.text = updates.text;
  if (updates.parent_id !== undefined) body.parent_id = updates.parent_id;

  const doc = await w.update(id, body);
  return fromV3DocToComment(doc);
}

/**
 * Delete a comment by ID.
 * @param id - comment doc_id
 * @param _postAuthor - v2 compat, ignored
 * @param _postService - v2 compat, ignored
 */
export async function deleteComment(
  id: string,
  _postAuthor?: string,
  _postService?: string,
): Promise<void> {
  const w = getV3Client();
  await w.delete(id);
}

// ── The thread seam (comments.md) ────────────────────────────────────────────
// The shared @web10/discover thread is presentational — the app injects the
// paged read + write + like seams. These are the social app's:
//
//   readThreadComments(postId, groups, {cursor, limit})
//     → one page of TOP-LEVEL comments, each enriched with likeCount +
//       likedByMe (over the loaded page only, never the whole thread).
//   readThreadReplies(commentId, groups, {cursor, limit})
//     → one page of a comment's replies, like-enriched.
//   createThreadComment({postId, text, parentId?, …})
//     → top-level (ref = post) or reply (ref = parent).
//
// The like enrichment is two parallel, independently-degrading reads: a
// server-side `GROUP BY ref_value` count over the page's comments' reaction
// docs + a batched ref read of the reader's own reactions (username-alone
// match, the 3.87.2 rule). A failure degrades to no like fields (the thread
// renders, the like UI just stays empty — the 3.25.x pattern).

/** A comment as the shared thread renders it (the package's CommentItem,
 *  enriched with the like state the app resolves). */
export interface ThreadComment extends CommentRecord {
  likeCount?: number;
  likedByMe?: boolean;
  /** The comment's photos, resolved to displayable media for the shared thread
   *  (the node's read path resolves `media_refs`; we map them to `MediaRecord`,
   *  which is structurally the shared package's `MediaItem`). */
  media?: MediaRecord[];
}

/** Map a comment's resolved `media_refs` to displayable media for the shared
 *  thread. The node's read path rewrites `media_refs` to resolved objects
 *  (with a fresh presigned `read_url`); bare doc_ids (a write-path read) are
 *  dropped — they have no URL to render. */
function commentMedia(comment: CommentRecord): MediaRecord[] | undefined {
  const refs = comment.media_refs;
  if (!refs?.length) return undefined;
  const items = refs
    .filter((r): r is ResolvedMediaRef => typeof r !== 'string' && !!r.read_url)
    .map((r) => fromResolvedMediaRef(r));
  return items.length ? items : undefined;
}

/** Enrich a page of comments with likeCount + likedByMe (degrading reads). */
async function enrichLikes(comments: CommentRecord[], groups: string[]): Promise<ThreadComment[]> {
  const ids = comments.map((c) => c._id).filter((id): id is string => !!id);
  if (!ids.length) return comments as ThreadComment[];

  const w = getV3Client();
  const token = w.readToken();
  const quoted = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');

  const [countRows, ownDocs] = await Promise.all([
    w.query(
      'SELECT ref_value, ' +
        "countIf(JSONExtractString(body, 'type') = 'like') AS like_count " +
        `FROM reactions WHERE ref_value IN (${quoted}) GROUP BY ref_value`,
      { groups },
    ).catch((e) => {
      console.error('[comments] like-count query failed, degrading:', e);
      return { rows: [] as Record<string, unknown>[], count: 0 };
    }),
    w.read('reactions', { groups, ref: ids }).catch((e) => {
      console.error('[comments] own-reactions read failed, degrading:', e);
      return [] as Awaited<ReturnType<typeof w.read>>;
    }),
  ]);

  const likeCount: Record<string, number> = {};
  for (const row of countRows.rows) {
    likeCount[String(row.ref_value)] = Number(row.like_count) || 0;
  }
  const likedByMe: Record<string, boolean> = {};
  if (token) {
    for (const doc of ownDocs) {
      if (extractUsername(doc.author_key) !== token.username) continue;
      const type = ((doc.body as Record<string, unknown>).type as string) || 'like';
      if (type === 'like' && doc.ref_value) likedByMe[doc.ref_value] = true;
    }
  }

  console.log(
    '[comments] enrichLikes —',
    comments.length, 'comments,',
    Object.values(likeCount).reduce((a, b) => a + b, 0), 'likes,',
    Object.keys(likedByMe).length, 'by me',
  );

  return comments.map((c) => ({
    ...c,
    likeCount: c._id ? likeCount[c._id] ?? 0 : 0,
    likedByMe: c._id ? !!likedByMe[c._id] : false,
  }));
}

/**
 * Read one page of a post's top-level comments, like-enriched. The thread's
 * initial load + "view more comments" both call this (with the cursor for
 * subsequent pages). Also returns `replyCounts` (each top-level comment's
 * total reply count) so the thread can pre-fetch each comment's first reply
 * page + show "view more replies" only where there is more.
 */
export async function readThreadComments(
  postId: string,
  groups?: string[],
  opts: { cursor?: string; limit?: number } = {},
): Promise<CommentPage & { comments: ThreadComment[]; replyCounts: Record<string, number> }> {
  const targetGroups = groups || [getDiscoverGroupId()];
  const page = await readComments(postId, targetGroups, opts);
  const [comments, replyCounts] = await Promise.all([
    enrichLikes(page.comments, targetGroups),
    countRepliesByComment(
      page.comments.map((c) => c._id).filter((id): id is string => !!id),
      targetGroups,
    ).catch((e) => {
      console.error('[comments] reply-count read failed, degrading:', e);
      return {} as Record<string, number>;
    }),
  ]);
  // Attach each comment's resolved photos for the shared thread to render.
  const withMedia = comments.map((c) => ({ ...c, media: commentMedia(c) }));
  return { comments: withMedia, nextCursor: page.nextCursor, replyCounts };
}

/**
 * Read one page of a comment's replies, like-enriched. The thread's
 * "view more replies" calls this.
 */
export async function readThreadReplies(
  commentId: string,
  groups?: string[],
  opts: { cursor?: string; limit?: number } = {},
): Promise<CommentPage & { comments: ThreadComment[] }> {
  const targetGroups = groups || [getDiscoverGroupId()];
  const page = await readReplies(commentId, targetGroups, opts);
  const comments = await enrichLikes(page.comments, targetGroups);
  const withMedia = comments.map((c) => ({ ...c, media: commentMedia(c) }));
  return { comments: withMedia, nextCursor: page.nextCursor };
}

/**
 * Create a comment (top-level) or a reply (`parentId` set) — the shared
 * thread's write seam. A reply refs its parent (comments.md); a top-level
 * comment refs the post. `mediaRefs` = the doc_ids of photos the thread
 * already uploaded (the app's `uploadMedia` seam).
 */
export async function createThreadComment(args: {
  postId: string;
  text: string;
  parentId?: string;
  groups?: string[];
  postAuthor?: string;
  postService?: string;
  mediaRefs?: string[];
}): Promise<ThreadComment> {
  return createComment(
    {
      post_id: args.postId,
      text: args.text,
      parent_id: args.parentId,
      media_refs: args.mediaRefs,
      created_at: new Date().toISOString(),
    },
    args.groups ?? args.postAuthor,
    args.postService,
  );
}

// ── Comment photo upload (comments.md "Photos in comments") ──────────────────

/**
 * Upload one comment photo through the standard media pipeline and return its
 * doc_id + a displayable preview (the shared thread's `uploadMedia` seam).
 *
 * Images only (video in a comment is a separate build). The photo is downscaled
 * + recompressed client-side (`processImage`, the composer idiom), a thumbnail
 * is generated, and it uploads to `public_media` (the public-post convention —
 * the node resolves it cross-user by the comment's author, so the collection
 * is just metadata). Returns the doc_id the comment body references.
 */
export async function uploadCommentPhoto(file: File): Promise<{
  docId: string;
  url: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  mimeType?: string;
}> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only photos are supported in comments.');
  }
  const validation = validateMedia(file);
  if (validation) throw new Error(validation.message);

  const processed = await processImage(file);
  const processedFile = new File([processed.blob], file.name, { type: processed.mimeType });
  const thumb = await generateThumbnail(processedFile);
  const thumbFile = new File([thumb.blob], `thumb-${Date.now()}.webp`, { type: thumb.mimeType });

  const record = await uploadMedia({
    file: processedFile,
    thumbnailFile: thumbFile,
    width: processed.width,
    height: processed.height,
    service: 'public_media',
  });
  if (!record._id) throw new Error('Photo upload failed: no document id');
  return {
    docId: record._id,
    url: record.url,
    thumbUrl: record.thumbnail_url,
    width: record.width,
    height: record.height,
    mimeType: record.mime_type,
  };
}
