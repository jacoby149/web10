import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the P2P seam — capture sendP2P (the write side) + onP2PInbound (the
// notifications module imports both). vi.hoisted so the array is available in
// the hoisted mock factory.
const { sendP2PCalls } = vi.hoisted(() => ({
  sendP2PCalls: [] as Array<[string, string, Record<string, unknown>]>,
}));
vi.mock('../../data/p2p', () => ({
  sendP2P: (provider: string, username: string, payload: Record<string, unknown>) => {
    sendP2PCalls.push([provider, username, payload]);
    return true;
  },
  onP2PInbound: () => () => {},
}));

// Mock the groups helpers the action sites + notifications module use.
vi.mock('../../data/groups', () => ({
  ensureFollowers: vi.fn(async () => 'web10.app/groups/users/alice/followers'),
  followersGroupId: (u: string) => `web10.app/groups/users/${u}/followers`,
  getDiscoverGroupId: () => 'web10.app/groups/web10/discover',
  getMyGroups: vi.fn(async () => []),
}));

// A controllable V3 client.
function makeClient(overrides: { readByIdDoc?: unknown } = {}) {
  return {
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice', site: 'web10' })),
    create: vi.fn(async () => ({ doc_id: 'new-doc', author_key: 'web10.app/alice', body: {} })),
    read: vi.fn(async () => []),
    readById: vi.fn(async () => overrides.readByIdDoc ?? null),
    joinGroup: vi.fn(async () => {}),
    getMyGroups: vi.fn(async () => []),
    createGroup: vi.fn(async () => ({ group_id: 'web10.app/groups/users/alice/dm-alice-bob' })),
    state: { apiOrigin: 'https://api.web10.app', token: 'tok', rtcServer: 'rtc.web10.app' },
  };
}

import * as v3 from '../../data/v3';
import { sendNotification } from '../../data/notifications';
import { sendDm } from '../../data/dms';
import { followUser } from '../../data/follows';
import { createReaction } from '../../data/reactions';
import { createComment } from '../../data/comments';

// The last sendP2P call's (provider, username, payload).
function lastNudge(): { provider: string; username: string; payload: Record<string, unknown> } {
  const call = sendP2PCalls[sendP2PCalls.length - 1];
  if (!call) throw new Error('sendP2P was not called');
  return { provider: call[0], username: call[1], payload: call[2] };
}

describe('write side (D69) — actions nudge the target over P2P', () => {
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    sendP2PCalls.length = 0;
    client = makeClient();
    vi.spyOn(v3, 'getV3Client').mockReturnValue(client as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendNotification (the helper)', () => {
    it('sends a nudge with the right payload', () => {
      sendNotification({ username: 'bob', provider: 'web10.app' }, { type: 'reaction', from: 'alice', ref_doc_id: 'post-1' });
      const n = lastNudge();
      expect(n.provider).toBe('web10.app');
      expect(n.username).toBe('bob');
      expect(n.payload).toMatchObject({ type: 'reaction', from: 'alice', ref_doc_id: 'post-1' });
      expect(n.payload.sent_at).toBeTypeOf('string');
    });

    it('does not nudge the actor themselves (self-guard)', () => {
      sendNotification({ username: 'alice', provider: 'web10.app' }, { type: 'reaction', from: 'alice', ref_doc_id: 'post-1' });
      expect(sendP2PCalls.length).toBe(0);
    });

    it('does nothing for an empty target', () => {
      sendNotification({ username: '', provider: 'web10.app' }, { type: 'reaction', from: 'alice' });
      expect(sendP2PCalls.length).toBe(0);
    });
  });

  describe('sendDm → nudge the recipient', () => {
    it('nudges the DM recipient with type "dm"', async () => {
      const conv = 'web10.app/alice--web10.app/bob';
      await sendDm(conv, 'hey');
      const n = lastNudge();
      expect(n.username).toBe('bob');
      expect(n.payload).toMatchObject({ type: 'dm', from: 'alice' });
    });
  });

  describe('followUser → nudge the followed user', () => {
    it('nudges the target with type "follow_request"', async () => {
      await followUser('bob', 'web10.app');
      const n = lastNudge();
      expect(n.username).toBe('bob');
      expect(n.payload).toMatchObject({ type: 'follow_request', from: 'alice' });
    });
  });

  describe('createReaction → nudge the post author', () => {
    it('resolves the post author + nudges with type "reaction"', async () => {
      client.readById.mockResolvedValueOnce({ doc_id: 'post-1', author_key: 'web10.app/bob', body: { text: 'hi' } });
      await createReaction({ target_service: 'posts', target_id: 'post-1', type: 'like', created_at: new Date().toISOString(), author_username: 'alice', author_provider: 'web10.app' });
      // The author resolve is async (readPostById) — let it settle.
      await vi.waitFor(() => expect(sendP2PCalls.length).toBeGreaterThan(0));
      const n = lastNudge();
      expect(n.username).toBe('bob');
      expect(n.payload).toMatchObject({ type: 'reaction', from: 'alice', ref_doc_id: 'post-1' });
    });

    it('does not nudge when reacting to your own post (self-guard)', async () => {
      client.readById.mockResolvedValueOnce({ doc_id: 'post-1', author_key: 'web10.app/alice', body: { text: 'hi' } });
      await createReaction({ target_service: 'posts', target_id: 'post-1', type: 'like', created_at: new Date().toISOString(), author_username: 'alice', author_provider: 'web10.app' });
      await vi.waitFor(() => {}); // let the resolve settle
      // The self-guard in sendNotification drops it (author === actor).
      expect(sendP2PCalls.length).toBe(0);
    });
  });

  describe('createComment → nudge the right author', () => {
    it('nudges the post author for a top-level comment (type "comment")', async () => {
      client.readById.mockResolvedValueOnce({ doc_id: 'post-1', author_key: 'web10.app/bob', body: { text: 'hi' } });
      await createComment({ text: 'nice', post_id: 'post-1', author_username: 'alice', author_provider: 'web10.app', created_at: new Date().toISOString() });
      await vi.waitFor(() => expect(sendP2PCalls.length).toBeGreaterThan(0));
      const n = lastNudge();
      expect(n.username).toBe('bob');
      expect(n.payload).toMatchObject({ type: 'comment', from: 'alice', ref_doc_id: 'post-1' });
    });

    it('nudges the comment author for a reply (type "reply")', async () => {
      client.readById.mockResolvedValueOnce({ doc_id: 'cmt-1', author_key: 'web10.app/carol', body: { text: 'parent' } });
      await createComment({ text: 're', post_id: 'post-1', parent_id: 'cmt-1', author_username: 'alice', author_provider: 'web10.app', created_at: new Date().toISOString() });
      await vi.waitFor(() => expect(sendP2PCalls.length).toBeGreaterThan(0));
      const n = lastNudge();
      expect(n.username).toBe('carol');
      expect(n.payload).toMatchObject({ type: 'reply', from: 'alice', ref_doc_id: 'cmt-1' });
    });
  });
});
