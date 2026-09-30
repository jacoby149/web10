import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as settings from '../../data/settings';
import * as dms from '../../data/dms';
import * as messagesUnread from '../../data/messagesUnread';

// Mock the P2P seam — capture the onP2PInbound subscription so tests can drive
// inbound DM nudges (the app-wide bus the store subscribes to).
const inboundListeners: Array<(conn: { peer: string }, data: unknown) => void> = [];
vi.mock('../../data/p2p', () => ({
  onP2PInbound: (listener: (conn: { peer: string }, data: unknown) => void) => {
    inboundListeners.push(listener);
    return () => {
      const i = inboundListeners.indexOf(listener);
      if (i >= 0) inboundListeners.splice(i, 1);
    };
  },
}));

// A DM record the store compares against the read cursor.
function dm(sender: string, sentAt: string, id: string) {
  return {
    _id: id,
    message: 'hi',
    sender_username: sender,
    sender_provider: 'web10.app',
    recipient_username: 'alice',
    recipient_provider: 'web10.app',
    sent_at: sentAt,
  } as never;
}

const CONN_BOB = 'web10.app/alice--web10.app/bob';

function driveInbound(data: unknown): void {
  for (const l of inboundListeners) l({ peer: 'web10_app bob web10 web10-social' }, data);
}

describe('messagesUnread (the Messages badge store)', () => {
  beforeEach(() => {
    messagesUnread.teardownMessagesUnread();
    inboundListeners.length = 0;
    vi.clearAllMocks();
    vi.spyOn(v3, 'getV3Client').mockReturnValue({
      readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice', site: 'web10' })),
      state: { apiOrigin: 'https://api.web10.app', token: 'tok', rtcServer: 'rtc.web10.app' },
    } as never);
    vi.spyOn(settings, 'readSettings').mockResolvedValue({} as never);
    vi.spyOn(settings, 'saveSettings').mockResolvedValue({} as never);
    vi.spyOn(dms, 'conversationKey').mockImplementation(
      (a, b) => [`${a.provider}/${a.username}`, `${b.provider}/${b.username}`].sort().join('--'),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    messagesUnread.teardownMessagesUnread();
  });

  it('does nothing when there is no token', async () => {
    vi.spyOn(v3, 'getV3Client').mockReturnValue({
      readToken: vi.fn(() => null),
      state: { apiOrigin: 'https://api.web10.app', token: null, rtcServer: 'rtc.web10.app' },
    } as never);
    await messagesUnread.initMessagesUnread();
    expect(messagesUnread.unreadMessagesCount()).toBe(0);
    expect(inboundListeners.length).toBe(0); // not subscribed (not signed in)
  });

  it('counts a conversation with a message from the other party as unread', async () => {
    vi.spyOn(dms, 'listConversations').mockResolvedValue([CONN_BOB]);
    vi.spyOn(dms, 'getLastDm').mockResolvedValue(dm('bob', '2026-01-02T00:00:00Z', 'm1'));
    await messagesUnread.initMessagesUnread();
    expect(messagesUnread.unreadMessagesCount()).toBe(1);
    expect(messagesUnread.isConversationUnread(CONN_BOB)).toBe(true);
  });

  it('does not count a conversation whose latest message is mine', async () => {
    vi.spyOn(dms, 'listConversations').mockResolvedValue([CONN_BOB]);
    vi.spyOn(dms, 'getLastDm').mockResolvedValue(dm('alice', '2026-01-02T00:00:00Z', 'm1'));
    await messagesUnread.initMessagesUnread();
    expect(messagesUnread.unreadMessagesCount()).toBe(0);
  });

  it('marks a conversation read (clears the badge) and persists the cursor', async () => {
    vi.spyOn(dms, 'listConversations').mockResolvedValue([CONN_BOB]);
    vi.spyOn(dms, 'getLastDm').mockResolvedValue(dm('bob', '2026-01-02T00:00:00Z', 'm1'));
    await messagesUnread.initMessagesUnread();
    expect(messagesUnread.unreadMessagesCount()).toBe(1);
    await messagesUnread.markConversationRead(CONN_BOB, '2026-01-02T00:00:00Z');
    expect(messagesUnread.unreadMessagesCount()).toBe(0);
    expect(settings.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ dmReadCursors: expect.objectContaining({ [CONN_BOB]: '2026-01-02T00:00:00Z' }) }),
    );
  });

  it('keeps a conversation unread when a NEWER message from the other party arrives', async () => {
    vi.spyOn(dms, 'listConversations').mockResolvedValue([CONN_BOB]);
    vi.spyOn(dms, 'getLastDm').mockResolvedValue(dm('bob', '2026-01-01T00:00:00Z', 'm1'));
    await messagesUnread.initMessagesUnread();
    await messagesUnread.markConversationRead(CONN_BOB, '2026-01-01T00:00:00Z');
    expect(messagesUnread.unreadMessagesCount()).toBe(0);
    // A newer message from bob arrives (the inbound nudge re-reads the conv).
    vi.mocked(dms.getLastDm).mockResolvedValue(dm('bob', '2026-01-02T00:00:00Z', 'm2'));
    driveInbound({ doc_id: 'm2', message: 'again', from: 'bob' });
    await vi.waitFor(() => {
      expect(messagesUnread.unreadMessagesCount()).toBe(1);
    });
  });

  it('ignores notification nudges (only DM nudges bump the badge)', async () => {
    vi.spyOn(dms, 'listConversations').mockResolvedValue([CONN_BOB]);
    vi.spyOn(dms, 'getLastDm').mockResolvedValue(dm('bob', '2026-01-01T00:00:00Z', 'm1'));
    await messagesUnread.initMessagesUnread();
    await messagesUnread.markConversationRead(CONN_BOB, '2026-01-01T00:00:00Z');
    expect(messagesUnread.unreadMessagesCount()).toBe(0);
    // A notification nudge (type: reaction) is not a DM nudge — ignored.
    driveInbound({ type: 'reaction', from: 'bob', ref_doc_id: 'p1' });
    await new Promise((r) => setTimeout(r, 10));
    expect(messagesUnread.unreadMessagesCount()).toBe(0);
  });

  it('seeds the cursor from settings (a previously-read conversation stays read)', async () => {
    vi.spyOn(settings, 'readSettings').mockResolvedValue({
      dmReadCursors: { [CONN_BOB]: '2026-01-01T00:00:00Z' },
    } as never);
    vi.spyOn(dms, 'listConversations').mockResolvedValue([CONN_BOB]);
    // The latest message is at/before the cursor → read.
    vi.spyOn(dms, 'getLastDm').mockResolvedValue(dm('bob', '2026-01-01T00:00:00Z', 'm1'));
    await messagesUnread.initMessagesUnread();
    expect(messagesUnread.unreadMessagesCount()).toBe(0);
  });

  it('teardown clears state + unsubscribes', async () => {
    vi.spyOn(dms, 'listConversations').mockResolvedValue([CONN_BOB]);
    vi.spyOn(dms, 'getLastDm').mockResolvedValue(dm('bob', '2026-01-01T00:00:00Z', 'm1'));
    await messagesUnread.initMessagesUnread();
    expect(inboundListeners.length).toBe(1);
    messagesUnread.teardownMessagesUnread();
    expect(inboundListeners.length).toBe(0);
    expect(messagesUnread.unreadMessagesCount()).toBe(0);
  });
});
