import { getWapi } from './wapi';
import { getCachedSchema, createPublicEntry, queryPublicEntries } from './feed';
import { API_ORIGIN } from '../lib/origins';
import type { CommentRecord } from './types';

// ── Comments data layer ────────────────────────────────────────────────────
// Phase 5.5: comments are written both to the legacy `comments` service
// AND to the public ledger (/public/entries) so the discovery API can count
// engagement. Per D32, the mirror is UNCONDITIONAL — comments are public
// discourse, the collection-level terms is the security boundary.

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
 * Phase 5.5: also writes to the public ledger unconditionally (D32).
 */
export async function createComment(comment: Omit<CommentRecord, '_id'>): Promise<CommentRecord> {
  const wapi = getWapi();
  const record = await wapi.create<CommentRecord>('comments', comment);

  // Mirror to the public ledger unconditionally (D32: comments are public)
  const commentSchema = getCachedSchema('Comment');
  if (commentSchema?._id) {
    const token = wapi.readToken();
    createPublicEntry({
      schema_id: commentSchema._id,
      target: `posts:${comment.post_id}`,
      payload: {
        action: 'comment',
        text: comment.text,
        author_username: token?.username,
        author_provider: token?.provider,
      },
    }).catch(() => { /* non-fatal */ });
  }

  return record;
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
 * Also removes the mirrored ledger entry so the comment drops out of the count.
 */
export async function deleteComment(id: string): Promise<void> {
  const wapi = getWapi();

  // Read the comment to find its post_id and author for ledger cleanup
  const comment = await wapi.read<CommentRecord>('comments', { _id: id });
  if (comment.length > 0) {
    const c = comment[0];
    const token = wapi.readToken();
    const target = `posts:${c.post_id}`;

    // Query the ledger for the matching entry and delete it
    const entries = await queryPublicEntries({ target });
    const tokenUsername = token?.username;
    const tokenProvider = token?.provider;
    const matching = entries.filter(
      (e) =>
        e.payload &&
        (e.payload as Record<string, unknown>).action === 'comment' &&
        (e.payload as Record<string, unknown>).author_username === tokenUsername &&
        (e.payload as Record<string, unknown>).author_provider === tokenProvider &&
        (e.payload as Record<string, unknown>).text === c.text,
    );

    for (const entry of matching) {
      if (entry._id) {
        try {
          await fetch(`${API_ORIGIN}/public/entries/${entry._id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token?.site || ''}`,
            },
          });
        } catch {
          // non-fatal — the comment record is still deleted
        }
      }
    }
  }

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