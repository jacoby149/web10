import { getV3Client } from './v3';
import { getDiscoverGroupId } from './groups';
import { fromV3DocToComment, type CommentRecord } from './types';

// ── Comments data layer (v3) ─────────────────────────────────────────────────
// Comments are documents in the `comments` collection with `ref_value` pointing
// to the parent post or comment. No public ledger mirror needed — v3 uses
// direct reads with groups for engagement counts.

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
 */
export async function readReplies(commentId: string, groups?: string[]): Promise<CommentRecord[]> {
  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  // The ref filter: the server returns only the comments whose ref_value =
  // commentId (replies to this comment), via the safe-query engine.
  const docs = await w.read('comments', { groups: targetGroups, ref: commentId });
  return docs.map(fromV3DocToComment);
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