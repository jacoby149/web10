import { getV3Client } from './v3';
import { getDiscoverGroupId } from './groups';
import { fromV3DocToComment, extractUsername, extractProvider, type CommentRecord } from './types';
import { sendNotification } from './notifications';
import { readPostById } from './posts';

// ── Comments data layer (v3) ─────────────────────────────────────────────────
// Comments are documents in the `comments` collection. The threading model
// (comments.md): `ref_value` is ALWAYS the post's doc_id — for top-level
// comments AND replies (that is what keeps the post's comment count true —
// the feed/board counts `ref_value IN (postIds)`). A reply additionally
// carries `body.parent_id` = the parent comment's doc_id. One
// `readComments(postId)` read therefore returns the whole conversation; the
// thread UI groups by `parent_id` client-side. No public ledger mirror
// needed — v3 uses direct reads with groups for engagement counts.

/**
 * Read all comments for a post.
 */
export async function readComments(postId: string, groups?: string[]): Promise<CommentRecord[]> {
  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  // The ref filter (the flexible read, phase 1): the server returns only the
  // comments whose ref_value = postId (via the safe-query engine — group
  // filter + block/sharing/hidden), not all comments in the group. No
  // client-side filter needed.
  const docs = await w.read('comments', { groups: targetGroups, ref: postId });
  return docs.map(fromV3DocToComment);
}

/**
 * Read top-level comments (no parent_id).
 */
export async function readTopLevelComments(postId: string, groups?: string[]): Promise<CommentRecord[]> {
  const comments = await readComments(postId, groups);
  return comments.filter((c) => !c.parent_id);
}

/**
 * Read replies to a specific comment.
 *
 * A reply's `ref_value` is the POST's doc_id (not the parent comment's) —
 * that is what keeps the post's comment count true (comments.md). So a
 * ref-filtered read on the comment id finds nothing; the reply read resolves
 * the parent's post (one `readById`), reads the post's whole conversation,
 * and filters to the replies in memory. The thread UI doesn't use this
 * (it builds the tree from one `readComments` read) — this is the
 * targeted-read convenience.
 */
export async function readReplies(commentId: string, groups?: string[]): Promise<CommentRecord[]> {
  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  const parent = await w.readById(commentId, 'comments');
  const postId = parent?.ref_value || (parent?.body as Record<string, unknown> | undefined)?.post_id as string || '';
  if (!postId) return [];
  const comments = await readComments(postId, targetGroups);
  return comments.filter((c) => c.parent_id === commentId);
}

/**
 * Create a new comment on a post.
 * @param comment - the comment body
 * @param groupsOrPostAuthor - groups array, or postAuthor string (v2 compat)
 * @param postService - v2 compat, ignored
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
  };

  const targetGroups = groups || [getDiscoverGroupId()];
  // ref_value (the target post's doc_id) is a top-level create field, not in
  // the body — the server stores it in the ref_value column, which the read's
  // ref filter + engagement counts key off. Without this the comment is
  // orphaned (ref_value="" → the ref read never finds it).
  const doc = await w.create('comments', body, { groups: targetGroups, ref_value: comment.post_id });
  // The write side (D69): nudge the right author (best-effort, fire-and-forget —
  // a resolve failure never affects the comment). A reply (parent_id set) →
  // the comment author; a top-level comment → the post author.
  if (comment.parent_id) {
    w.readById(comment.parent_id, 'comments')
      .then((c) => {
        const author = extractUsername(c.author_key);
        if (author) {
          sendNotification(
            { username: author, provider: extractProvider(c.author_key) || token.provider },
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
            { username: post.author_username, provider: post.author_provider || token.provider },
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

/**
 * Count comments on a post.
 */
export async function countComments(postId: string, groups?: string[]): Promise<number> {
  const comments = await readComments(postId, groups);
  return comments.length;
}

// ── The thread seam (comments.md) ────────────────────────────────────────────
// The shared @web10/discover thread is presentational — the app injects the
// read + write + like seams. These two are the social app's: the read returns
// the whole conversation (top-level + replies, one read — every comment's
// ref_value is the post) enriched with each comment's like count + whether
// the reader liked it; the write takes parentId (a reply) or not (top-level).

/** A comment as the shared thread renders it (the package's CommentItem,
 *  enriched with the like state the app resolves). */
export interface ThreadComment extends CommentRecord {
  likeCount?: number;
  likedByMe?: boolean;
}

/**
 * Read a post's whole comment conversation, enriched with comment likes.
 *
 * One read returns every comment (top-level + replies — the ref filter keys
 * on the post, comments.md). Two parallel, independently-degrading reads
 * resolve the like state: a server-side `GROUP BY ref_value` count over the
 * comments' reaction docs (the feed's readFeedEngagementCounts shape) + a
 * batched ref read of the reader's own reactions (username-alone match, the
 * 3.87.2 rule). A failure degrades to no like fields (the thread renders,
 * the like UI just stays empty — the 3.25.x pattern).
 */
export async function readThreadComments(postId: string, groups?: string[]): Promise<ThreadComment[]> {
  const comments = await readComments(postId, groups);
  const ids = comments.map((c) => c._id).filter((id): id is string => !!id);
  if (!ids.length) return comments;

  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  const token = w.readToken();
  const quoted = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');

  const [countRows, ownDocs] = await Promise.all([
    w.query(
      'SELECT ref_value, ' +
        "countIf(JSONExtractString(body, 'type') = 'like') AS like_count " +
        `FROM reactions WHERE ref_value IN (${quoted}) GROUP BY ref_value`,
      { groups: targetGroups },
    ).catch((e) => {
      console.error('[comments] like-count query failed, degrading:', e);
      return { rows: [] as Record<string, unknown>[], count: 0 };
    }),
    w.read('reactions', { groups: targetGroups, ref: ids }).catch((e) => {
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
    '[comments] readThreadComments —',
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
 * Create a comment (top-level) or a reply (`parentId` set) — the shared
 * thread's write seam. Ref_value stays the post (comments.md); the reply's
 * parent_id rides in the body.
 */
export async function createThreadComment(args: {
  postId: string;
  text: string;
  parentId?: string;
  groups?: string[];
  postAuthor?: string;
  postService?: string;
}): Promise<ThreadComment> {
  return createComment(
    {
      post_id: args.postId,
      text: args.text,
      parent_id: args.parentId,
      created_at: new Date().toISOString(),
    },
    args.groups ?? args.postAuthor,
    args.postService,
  );
}