import { getWapi } from './wapi';
import { readMyPosts, readUserPublicPosts } from './posts';
import { readFollows } from './follows';
import type { FeedSort, InboxRecord, PostRecord } from './types';

// ── Pull feed (v0) ──────────────────────────────────────────────────────────
// The feed PULLS: one direct read per person you follow (their public_posts
// collection — anon-read is whitelisted by the canonical term) plus your own
// posts. No inbox fan-out, no discovery board: the discovery projection is
// for the Discover page only (operator, 31.07.2026: "on the feed it has to
// send a request for each person i follow! … the thing that should be public
// discover is only the discover page"). Items are shaped as InboxRecord so
// FeedScreen's rendering/media/engagement pipeline is unchanged. A followee
// whose collection is unreadable is skipped — never fatal to the feed.

function postToInboxItem(post: PostRecord, username: string, provider: string): InboxRecord {
  return {
    author_username: username,
    author_provider: provider,
    post_id: post._id || '',
    delivered_at: post.created_at || new Date(0).toISOString(),
    post_body: post as unknown as Record<string, unknown>,
    origin: 'web10',
  };
}

/**
 * Read the friends feed by pulling each followee's public_posts directly.
 * `newest`/`oldest` sort by the post's own created_at. `most_reacted`
 * returns the newest ordering — FeedScreen re-sorts client-side with the
 * per-post reaction counts it already fetches.
 */
export async function readPullFeed(sort: FeedSort = 'newest'): Promise<InboxRecord[]> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) return [];

  const items: InboxRecord[] = [];
  const seen = new Set<string>();
  const push = (post: PostRecord, username: string, provider: string) => {
    const item = postToInboxItem(post, username, provider);
    if (!item.post_id || seen.has(item.post_id)) return;
    seen.add(item.post_id);
    items.push(item);
  };

  // Your own posts first (public + private — your feed is yours).
  try {
    for (const p of await readMyPosts()) push(p, token.username, token.provider);
  } catch {
    // Own posts unreadable — keep going, the feed is still the friends'.
  }

  // One direct read per person you follow.
  let followees: { username: string; provider: string }[] = [];
  try {
    followees = (await readFollows())
      .filter((f) => f.status === 'active')
      .map((f) => ({ username: f.username, provider: f.provider }));
  } catch {
    // Follows unreadable — the feed is just your posts.
  }
  await Promise.all(
    followees.map(async (f) => {
      try {
        const posts = await readUserPublicPosts(f.username, f.provider);
        for (const p of posts) push(p, f.username, f.provider);
      } catch {
        // This followee's collection is unreadable — skip, never fatal.
      }
    }),
  );

  const direction = sort === 'oldest' ? 1 : -1;
  return items.sort(
    (a, b) => (new Date(a.delivered_at).getTime() - new Date(b.delivered_at).getTime()) * direction,
  );
}
