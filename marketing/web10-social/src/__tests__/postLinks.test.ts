import { describe, expect, it } from 'vitest';
import { postPath } from '@/lib/postLinks';
import { fromV3DocToPost } from '@/data/types';

describe('Post identity links', () => {
  it('uses the full group identity, never the group slug as a username', () => {
    const author = 'node/groups/users/alice/studio';
    expect(postPath({ _id: 'post', author_key: author, author_username: 'studio' })).toBe(`/groups/${encodeURIComponent(author)}/p/post`);
  });
  it('retains personal post permalinks', () => {
    expect(postPath({ _id: 'post', author_key: 'alice', author_username: 'alice' })).toBe('/u/alice/p/post');
  });
  it('preserves author and audit identity in the permalink mapper', () => {
    const post = fromV3DocToPost({ doc_id: 'post', author_key: 'node/groups/users/alice/studio', posted_by: 'bob', body: { title: 'A title', text: 'A caption' }, created_at: '2026-11-01', updated_at: '2026-11-01', collection_name: 'posts' });
    expect(post).toMatchObject({ author_key: 'node/groups/users/alice/studio', posted_by: 'bob', title: 'A title' });
  });
});
