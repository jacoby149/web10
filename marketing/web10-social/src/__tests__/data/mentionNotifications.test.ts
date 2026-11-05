import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readMentionNotifications, resolveMentionNotification, resolveMentionHref } from '@/data/mentionNotifications';
import type { Notification } from '@/data/notifications';

const { query, readById } = vi.hoisted(() => ({ query: vi.fn(), readById: vi.fn() }));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({ query, readById, readToken: () => ({ username: 'alice' }) }) }));

const doc = (id: string, text = '@alice', author = 'bob') => ({
  doc_id: id, author_key: author, body: { text, post_id: 'post' }, ref_value: 'parent', created_at: '2026-11-05T12:00:00Z',
});
const row = (type: Notification['type'], ref = 'source'): Notification => ({ id: `${type}:${ref}`, type, from: 'bob', ref_doc_id: ref, read: false, created_at: '2026-11-05T12:00:00Z' });

beforeEach(() => { vi.resetAllMocks(); query.mockResolvedValue({ rows: [] }); });

describe('mention notifications', () => {
  it('recovers public/group posts, comments and direct replies offline, deduplicating attachments', async () => {
    query.mockResolvedValueOnce({ rows: [doc('post'), doc('post')] })
      .mockResolvedValueOnce({ rows: [doc('comment')] })
      .mockResolvedValueOnce({ rows: [{ ...doc('reply', 'no repeated tag'), parent_body: { text: '@alice' } }] });
    const items = await readMentionNotifications(['discover', 'private-member-group'], 'alice');
    expect(items.map((n) => n.type)).toEqual(['post_mention', 'comment_mention', 'mention_reply']);
    expect(items.map((n) => n.ref_doc_id)).toEqual(['post', 'comment', 'reply']);
    expect(query.mock.calls.every(([, opts]) => opts.groups.includes('discover'))).toBe(true);
    expect(query.mock.calls[2][0]).toContain('JOIN comments p ON c.ref_value = p.doc_id');
    expect(query.mock.calls[0][0]).toContain("has(JSONExtract(c.body, 'mention_usernames', 'Array(String)'), 'alice')");
  });

  it('does not trust stale indexes or self-tags and isolates failed sources', async () => {
    query.mockResolvedValueOnce({ rows: [doc('stale', 'tag removed'), doc('own', '@alice', 'alice'), { ...doc('delegated'), posted_by: 'alice' }] })
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce({ rows: [{ ...doc('reply'), parent_body: { text: '`@alice`' } }] });
    expect(await readMentionNotifications(['discover'], 'alice')).toEqual([]);
  });

  it('validates live nudges against canonical readable text and actor, not the payload', async () => {
    readById.mockResolvedValue(doc('source'));
    expect(await resolveMentionNotification('post_mention', 'source', 'alice')).toMatchObject({ from: 'bob', ref_doc_id: 'source' });
    readById.mockResolvedValue(doc('source', 'no mention'));
    expect(await resolveMentionNotification('post_mention', 'source', 'alice')).toBeNull();
    readById.mockRejectedValue(new Error('403'));
    expect(await resolveMentionNotification('post_mention', 'source', 'alice')).toBeNull();
  });

  it('requires the tagged parent to belong to the same post as its direct reply', async () => {
    readById.mockResolvedValueOnce(doc('reply', 'hi')).mockResolvedValueOnce({ ...doc('parent'), body: { text: '@alice', post_id: 'other-post' } });
    expect(await resolveMentionNotification('mention_reply', 'reply', 'alice')).toBeNull();
  });

  it.each(['bob', 'web10.app/groups/users/bob/club'])('deep-links post tags to the actual personal/group author %s', async (author) => {
    readById.mockResolvedValue(doc('post', '@alice', author));
    const owner = author === 'bob' ? '/u/bob' : `/groups/${encodeURIComponent(author)}`;
    expect(await resolveMentionHref(row('post_mention', 'post'))).toBe(`${owner}/p/post`);
  });

  it('opens the specific tagged comment, and denies an unreadable post', async () => {
    readById.mockImplementation(async (id) => id === 'post' ? doc('post', 'caption', 'carol') : doc(id));
    expect(await resolveMentionHref(row('comment_mention', 'comment'))).toBe('/u/carol/p/post?comment=comment');
    readById.mockImplementation(async (id) => { if (id === 'post') throw new Error('403'); return doc(id); });
    expect(await resolveMentionHref(row('comment_mention', 'comment'))).toBeNull();
  });

  it('retains separate read keys for multiple replies from the same person', async () => {
    query.mockResolvedValue({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: ['r1', 'r2'].map((id) => ({ ...doc(id, 'hi'), parent_body: { text: '@alice' } })) });
    const items = await readMentionNotifications(['discover'], 'alice');
    expect(items.map((n) => `${n.type}:${n.from}:${n.ref_doc_id}`)).toEqual(['mention_reply:bob:r1', 'mention_reply:bob:r2']);
  });
});
