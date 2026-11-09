import { peopleFaceSql, facePrepare } from '@web10/discover';
import { mediaReadFetch } from '@web10/discover/media-recovery';
import type { SourcedPost } from '@web10/discover/mixed-feed';
import { API_ORIGIN, API_HOST } from './origins';

export type PublicPost = SourcedPost & { author_face_pending?: boolean };

export function pendingPublicProfiles(posts: SourcedPost[], home: string): PublicPost[] {
  return posts.map(post => ({ ...post, author_face_pending: post.source_origin === home
    && !!post.author_key && !post.author_key.includes('/groups/')
    && (!post.avatar_url || !post.profile?.display_name) }));
}

// Same paint-first seam as social's resolveDiscoverProfiles. Only the current
// home page participates; a foreign row never becomes a home profile request.
export async function resolvePublicProfiles(posts: PublicPost[], signal: AbortSignal): Promise<PublicPost[]> {
  const pending = posts.filter(post => post.author_face_pending);
  const authors = [...new Set(pending.map(post => post.author_key!))];
  if (!authors.length) return posts;
  const groups = [...new Set(authors.map(author => {
    const parts = author.split('/users/');
    const [provider, username] = parts.length === 2 ? parts : [API_HOST, author];
    return `${provider}/groups/users/${username}/followers`;
  }))];
  const owner = new AbortController();
  const abort = () => owner.abort();
  if (signal.aborted) abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  console.info('[public-feed] profile batch started', { authors: authors.length });
  try {
    const response = await mediaReadFetch(`${API_ORIGIN}/v3/query`, {
      method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: owner.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: peopleFaceSql(authors), groups,
        prepare: { face: facePrepare('avatar_ref', 'avatar_url') } }),
    });
    if (!response.ok) throw new Error('Profile batch unavailable');
    const data = await response.json();
    const rows: Record<string, unknown>[] = Array.isArray(data.rows) ? data.rows : [];
    const faces = new Map(rows.filter(row => row && typeof row === 'object').map(row => [String(row.author_key), row]));
    console.info('[public-feed] profile batch completed', { readable: faces.size });
    return posts.map(post => {
      if (!post.author_face_pending) return post;
      const row = faces.get(post.author_key!);
      const body = row?.body && typeof row.body === 'object' ? row.body as Record<string, unknown> : undefined;
      return { ...post, author_face_pending: false,
        profile: { ...post.profile, ...(typeof body?.display_name === 'string' && body.display_name ? { display_name: body.display_name } : {}) },
        avatar_url: typeof row?.avatar_url === 'string' && row.avatar_url ? row.avatar_url : post.avatar_url };
    });
  } catch {
    console.warn('[public-feed] profile batch unavailable; retaining author fallbacks');
    return posts.map(post => post.author_face_pending ? { ...post, author_face_pending: false } : post);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
