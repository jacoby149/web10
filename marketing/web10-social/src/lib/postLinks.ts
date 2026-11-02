import type { PostRecord } from '@/data/types';

export function postPath(post: Pick<PostRecord, '_id' | 'author_key' | 'author_username'>): string {
  const owner = post.author_key?.includes('/groups/')
    ? `/groups/${encodeURIComponent(post.author_key)}`
    : `/u/${encodeURIComponent(post.author_username || 'unknown')}`;
  return `${owner}/p/${encodeURIComponent(post._id || 'unknown')}`;
}
