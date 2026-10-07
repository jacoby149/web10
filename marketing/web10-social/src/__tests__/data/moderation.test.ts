import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as moderation from '../../data/moderation';
import { getDiscoverGroupId } from '../../data/groups';

function setToken(raw: string) {
  document.cookie = `token=${encodeURIComponent(raw)}; path=/`;
}
function clearToken() {
  document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

describe('parseWeb10Link', () => {
  it('parses a post permalink', () => {
    expect(moderation.parseWeb10Link('/u/alice/p/post-123')).toEqual({
      kind: 'post',
      username: 'alice',
      postId: 'post-123',
    });
  });

  it('parses a full post URL (origin stripped)', () => {
    expect(moderation.parseWeb10Link('https://social.web10.app/u/alice/p/post-123')).toEqual({
      kind: 'post',
      username: 'alice',
      postId: 'post-123',
    });
  });

  it('parses a profile permalink', () => {
    expect(moderation.parseWeb10Link('/u/alice')).toEqual({ kind: 'profile', username: 'alice' });
  });

  it('parses a group permalink', () => {
    expect(moderation.parseWeb10Link('/groups/some-group-id')).toEqual({
      kind: 'group',
      groupId: 'some-group-id',
    });
  });

  it('decodes URI-encoded segments', () => {
    expect(moderation.parseWeb10Link('/u/al%40ice/p/p%201')).toEqual({
      kind: 'post',
      username: 'al@ice',
      postId: 'p 1',
    });
  });

  it('strips a query string before parsing', () => {
    expect(moderation.parseWeb10Link('/u/alice/p/post-123?comment=c-1')).toEqual({
      kind: 'post',
      username: 'alice',
      postId: 'post-123',
    });
  });

  it('returns null for a non-web10 link', () => {
    expect(moderation.parseWeb10Link('https://example.com/foo')).toBeNull();
    expect(moderation.parseWeb10Link('/feed')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(moderation.parseWeb10Link('')).toBeNull();
    expect(moderation.parseWeb10Link('   ')).toBeNull();
  });
});

describe('readModerationFlags', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the flags from /v3/moderation/flags', async () => {
    setToken('raw-jwt');
    const flags = [
      { username: 'badguy', flag_count: 3, last_flagged: '2026-01-01T00:00:00', matched_words: ['word'] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flags }) }));
    const out = await moderation.readModerationFlags();
    expect(out).toEqual(flags);
  });

  it('returns [] when the node returns no flags', async () => {
    setToken('raw-jwt');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flags: [] }) }));
    expect(await moderation.readModerationFlags()).toEqual([]);
  });

  it('throws on a non-2xx response', async () => {
    setToken('raw-jwt');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ detail: 'not admin' }) }));
    await expect(moderation.readModerationFlags()).rejects.toThrow('not admin');
  });

  it('a missing delegated grant explains consent and never retries with another credential', async () => {
    setToken('app-jwt');
    const request = vi.fn().mockResolvedValue({ ok: false, status: 403,
      json: async () => ({ detail: 'App permission denied' }) });
    vi.stubGlobal('fetch', request);
    await expect(moderation.readModerationFlags()).rejects.toThrow('Log in again and approve');
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0][1].body).token).toBe('app-jwt');
  });
});

describe('setUserAutoHidden', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the username + hide to /v3/moderation/auto-hide', async () => {
    setToken('raw-jwt');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auto_hide_users: ['badguy'] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await moderation.setUserAutoHidden('badguy', true);
    expect(out).toEqual(['badguy']);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v3/moderation/auto-hide'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'badguy', hide: true, token: 'raw-jwt' }),
      }),
    );
  });

  it('throws when signed out', async () => {
    clearToken();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(moderation.setUserAutoHidden('x', true)).rejects.toThrow('not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('saveModerationConfig', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the update to /config/update with the nested token shape', async () => {
    setToken('raw-jwt');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await moderation.saveModerationConfig({ sensitive_words: ['a', 'b'], auto_moderate: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/config/update'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          token: { token: 'raw-jwt' },
          update: { sensitive_words: ['a', 'b'], auto_moderate: true },
        }),
      }),
    );
  });
});

describe('board hide / unhide', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hidePostFromBoard posts the discover group + doc_id to /v3/groups/hide', async () => {
    setToken('raw-jwt');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'hidden' }) });
    vi.stubGlobal('fetch', fetchMock);
    await moderation.hidePostFromBoard('doc-1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v3/groups/hide'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ group_id: getDiscoverGroupId(), doc_id: 'doc-1', token: 'raw-jwt' }),
      }),
    );
  });

  it('unhidePostFromBoard posts to /v3/groups/unhide', async () => {
    setToken('raw-jwt');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'restored' }) });
    vi.stubGlobal('fetch', fetchMock);
    await moderation.unhidePostFromBoard('doc-1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v3/groups/unhide'),
      expect.objectContaining({
        body: JSON.stringify({ group_id: getDiscoverGroupId(), doc_id: 'doc-1', token: 'raw-jwt' }),
      }),
    );
  });
});

describe('readHiddenPosts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the discover group to /v3/groups/hidden and returns the list', async () => {
    setToken('raw-jwt');
    const hidden = [
      { doc_id: 'h1', author_key: 'badguy', hidden_at: '2026-01-01', moderator_key: 'node', body: { text: 'x' } },
    ];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hidden }) });
    vi.stubGlobal('fetch', fetchMock);
    const out = await moderation.readHiddenPosts();
    expect(out).toEqual(hidden);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v3/groups/hidden'),
      expect.objectContaining({
        body: JSON.stringify({ group_id: getDiscoverGroupId(), token: 'raw-jwt' }),
      }),
    );
  });

  it('returns [] when the node returns no hidden docs', async () => {
    setToken('raw-jwt');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hidden: [] }) }));
    expect(await moderation.readHiddenPosts()).toEqual([]);
  });
});

describe('setUserBanned', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the username + ban to /v3/moderation/ban', async () => {
    setToken('raw-jwt');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ banned_users: ['badguy'] }) });
    vi.stubGlobal('fetch', fetchMock);
    const out = await moderation.setUserBanned('badguy', true);
    expect(out).toEqual(['badguy']);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v3/moderation/ban'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'badguy', ban: true, token: 'raw-jwt' }),
      }),
    );
  });

  it('throws when signed out', async () => {
    clearToken();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(moderation.setUserBanned('x', true)).rejects.toThrow('not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getBannedUsers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts to /v3/moderation/banned and maps the response', async () => {
    setToken('raw-jwt');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ banned_users: [{ username: 'badguy', banned_by: 'admin', banned_at: '2026-01-01T00:00:00Z' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await moderation.getBannedUsers();
    expect(out).toEqual(['badguy']);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v3/moderation/banned'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws when signed out', async () => {
    clearToken();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(moderation.getBannedUsers()).rejects.toThrow('not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
