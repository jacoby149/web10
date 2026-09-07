import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { readFeedEngagement } from '../../data/feed';
import {
  readSettings,
  saveSettings,
  sanitizeFeedKnobs,
  clearSettingsCache,
} from '../../data/settings';

// ── Feed knobs (D36 knobs on the feed, operator 30.08) ──────────────────────
// 1. readFeedEngagement — the ref pattern (reactions/comments counted by
//    ref_value over the feed's groups).
// 2. settings — the feed tuning persists as `feedKnobs` on the user's
//    `settings` doc (the web10 settings service in the followers group).

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    create: vi.fn(),
    read: vi.fn(),
    readRefCounts: vi.fn(),
    readById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getMyGroups: vi.fn(),
    getGroup: vi.fn(),
    createGroup: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('readFeedEngagement (the ref pattern — server-side count)', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the server-side counts for the feed posts', async () => {
    mock.readRefCounts.mockImplementation(async (service: string) => {
      if (service === 'reactions') return { p1: 2, p2: 1 };
      if (service === 'comments') return { p1: 1, p3: 1 };
      return {};
    });

    const { likes, comments } = await readFeedEngagement(['g1', 'g2'], ['p1', 'p2', 'p3']);

    expect(likes).toEqual({ p1: 2, p2: 1 });
    expect(comments).toEqual({ p1: 1, p3: 1 });
  });

  it('calls readRefCounts for reactions + comments with the post ids (no cap)', async () => {
    mock.readRefCounts.mockResolvedValue({});

    await readFeedEngagement(['ga', 'gb'], ['p1', 'p2']);

    expect(mock.readRefCounts).toHaveBeenCalledTimes(2);
    expect(mock.readRefCounts).toHaveBeenCalledWith('reactions', { groups: ['ga', 'gb'], ref: ['p1', 'p2'] });
    expect(mock.readRefCounts).toHaveBeenCalledWith('comments', { groups: ['ga', 'gb'], ref: ['p1', 'p2'] });
  });

  it('returns empty counts and makes no read when there are no posts', async () => {
    mock.readRefCounts.mockResolvedValue({});

    const { likes, comments } = await readFeedEngagement(['ga'], []);

    expect(likes).toEqual({});
    expect(comments).toEqual({});
    expect(mock.readRefCounts).not.toHaveBeenCalled();
  });
});

describe('settings — feedKnobs persistence (the web10 settings service)', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    clearSettingsCache();
    mock = mockV3Client();
    // The followers group exists AND the user is a member of it (ensureFollowers
    // checks membership via getMyGroups when the group exists — the 3.38.2 heal).
    mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers' });
    mock.getMyGroups.mockResolvedValue([{ group_id: 'web10.app/groups/users/alice/followers' }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('readSettings parses feedKnobs from the settings doc', async () => {
    mock.read.mockResolvedValue([
      {
        doc_id: 's1',
        body: {
          defaultVisibility: 'private',
          feedKnobs: { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 },
        },
      },
    ]);

    const s = await readSettings();

    expect(s.defaultVisibility).toBe('private');
    expect(s.feedKnobs).toEqual({ recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 });
  });

  it('readSettings leaves feedKnobs undefined when absent (the screen falls back to its default)', async () => {
    mock.read.mockResolvedValue([
      { doc_id: 's1', body: { defaultVisibility: 'public' } },
    ]);

    const s = await readSettings();

    expect(s.feedKnobs).toBeUndefined();
  });

  it('readSettings drops an invalid persisted knob state (out-of-range detent)', async () => {
    mock.read.mockResolvedValue([
      {
        doc_id: 's1',
        body: {
          defaultVisibility: 'public',
          feedKnobs: { recency: 9, likes: 5, comments: 0, halfLife: 5, character: 0 },
        },
      },
    ]);

    const s = await readSettings();

    expect(s.feedKnobs).toBeUndefined();
  });

  it('saveSettings writes feedKnobs into the settings doc body', async () => {
    // No existing doc → create path.
    mock.read.mockResolvedValue([]);

    const knobs = { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 };
    await saveSettings({ feedKnobs: knobs });

    expect(mock.create).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({ feedKnobs: knobs }),
      { groups: ['web10.app/groups/users/alice/followers'] },
    );
  });

  it('a visibility-only save does not clobber a previously saved knob state', async () => {
    // Existing doc with saved knobs; the save is visibility-only.
    mock.read.mockResolvedValue([
      {
        doc_id: 's1',
        body: {
          defaultVisibility: 'public',
          feedKnobs: { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 },
        },
      },
    ]);

    await saveSettings({ defaultVisibility: 'private' });

    expect(mock.update).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        defaultVisibility: 'private',
        feedKnobs: { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 },
      }),
    );
  });

  it('sanitizeFeedKnobs rejects non-integer / missing / non-object input', () => {
    expect(sanitizeFeedKnobs({ recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 })).toEqual(
      { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 },
    );
    expect(sanitizeFeedKnobs({ recency: 1.5, likes: 5, comments: 0, halfLife: 5, character: 0 })).toBeNull();
    expect(sanitizeFeedKnobs({ recency: 0, likes: 5, comments: 0, halfLife: 5 })).toBeNull();
    expect(sanitizeFeedKnobs(null)).toBeNull();
    expect(sanitizeFeedKnobs('nope')).toBeNull();
  });
});
