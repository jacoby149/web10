import type { PostRecord } from '@/data/types';

/** Display labels never replace the canonical author used for navigation. */
export function postAuthor(post: PostRecord): { name: string; href: string } {
  if (post.author_key?.includes('/groups/')) {
    return {
      name: post.group_identity?.name?.trim() || post.author_key.split('/').pop() || 'Group',
      href: `/groups/${encodeURIComponent(post.author_key)}`,
    };
  }
  return {
    name: post.profile?.display_name?.trim() || `@${post.author_username || 'unknown'}`,
    href: `/u/${encodeURIComponent(post.author_username || 'unknown')}`,
  };
}
