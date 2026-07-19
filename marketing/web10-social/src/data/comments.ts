import { getWapi } from './wapi';
import type { CommentRecord } from './types';

// ── Comments data layer ────────────────────────────────────────────────────

/**
 * Read all comments for a post.
 */
export async function readComments(postId: string): Promise<CommentRecord[]> {
  const wapi = getWapi();
  return wapi.read<CommentRecord>('comments', { post_id: postId });
}

/**
 * Read top-level comments (no parent_id).
 */
export async function readTopLevelComments(postId: string): Promise<CommentRecord[]> {
  const wapi = getWapi();
  return wapi.read<CommentRecord>('comments', {
    post_id: postId,
    parent_id: { $exists: false },
  });
}

/**
 * Read replies to a specific comment.
 */
export async function readReplies(commentId: string): Promise<CommentRecord[]> {
  const wapi = getWapi();
  return wapi.read<CommentRecord>('comments', { parent_id: commentId });
}

/**
 * Create a new comment on a post.
 */
export async function createComment(comment: Omit<CommentRecord, '_id'>): Promise<CommentRecord> {
  const wapi = getWapi();
  return wapi.create<CommentRecord>('comments', comment);
}

/**
 * Update a comment by ID.
 */
export async function updateComment(id: string, updates: Partial<CommentRecord>): Promise<CommentRecord> {
  const wapi = getWapi();
  return wapi.update<CommentRecord>('comments', { _id: id }, { $set: updates });
}

/**
 * Delete a comment by ID.
 */
export async function deleteComment(id: string): Promise<void> {
  const wapi = getWapi();
  await wapi.delete('comments', { _id: id });
}

/**
 * Count comments on a post.
 */
export async function countComments(postId: string): Promise<number> {
  const wapi = getWapi();
  const records = await wapi.read<CommentRecord>('comments', { post_id: postId });
  return records.length;
}