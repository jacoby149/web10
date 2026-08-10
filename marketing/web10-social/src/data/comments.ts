import { getV3Client } from './v3';
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
  const targetGroups = groups || ['web10.app/groups/web10/discover'];
  const docs = await w.read('comments', { groups: targetGroups });
  return docs
    .filter((d) => d.ref_value === postId)
    .map(fromV3DocToComment);
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
  const targetGroups = groups || ['web10.app/groups/web10/discover'];
  const docs = await w.read('comments', { groups: targetGroups });
  return docs
    .filter((d) => d.ref_value === commentId)
    .map(fromV3DocToComment);
}

/**
 * Create a new comment on a post.
 */
export async function createComment(
  comment: Omit<CommentRecord, '_id'>,
  groups?: string[],
): Promise<CommentRecord> {
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

  const targetGroups = groups || ['web10.app/groups/web10/discover'];
  const doc = await w.create('comments', body, { groups: targetGroups });
  // Set ref_value on the document body for the ref pattern
  doc.ref_value = comment.post_id;
  return fromV3DocToComment(doc);
}

/**
 * Update a comment by ID.
 */
export async function updateComment(id: string, updates: Partial<CommentRecord>): Promise<CommentRecord> {
  const w = getV3Client();
  const body: Record<string, unknown> = {};
  if (updates.text !== undefined) body.text = updates.text;
  if (updates.parent_id !== undefined) body.parent_id = updates.parent_id;

  const doc = await w.update(id, body);
  return fromV3DocToComment(doc);
}

/**
 * Delete a comment by ID.
 */
export async function deleteComment(id: string): Promise<void> {
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