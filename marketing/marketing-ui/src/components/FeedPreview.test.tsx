import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { GROUP_FACE_SQL, peopleFaceSql } from '@web10/discover';
import { fetchDiscoverFeed, searchDiscoverPosts, mapDiscoveryToFeedPost, feedPostToDiscover, TrendingCard } from './FeedPreview';
import { API_HOST, API_ORIGIN, SOCIAL_ORIGIN } from '@/lib/origins';

const group = 'api.example/groups/creator/music';
const otherGroup = 'other.example/groups/creator/music';
const avatar = 'https://cdn.example/group.jpg';
const doc = (id: string, author: string, text = 'matching post') => ({
  doc_id: id, author_key: author, body: { text }, tags: [],
  created_at: '2026-11-01T12:00:00Z', service: 'posts',
});
const ok = (data: unknown) => ({ ok: true, json: async () => data }) as Response;

function mockReads(faceResult: 'ok' | 'empty' | 'denied' | 'throw' = 'ok') {
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (body.prepare?.face && body.sql !== GROUP_FACE_SQL) return ok({ rows: [] });
    if (body.prepare?.face) {
      expect(url).toBe(`${API_ORIGIN}/v3/query`);
      expect(body.sql).toBe(GROUP_FACE_SQL);
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(body).not.toHaveProperty('token');
      if (faceResult === 'throw') throw new Error('offline');
      if (faceResult === 'denied') return { ok: false, status: 403 } as Response;
      if (faceResult === 'empty') return ok({ rows: [] });
      return ok({ rows: [{
        group_id: group, author_key: 'creator', body: { name: 'Music Collective' },
        ...(body.prepare.face.mediaField === 'avatar_ref' ? { avatar_url: avatar } : {}),
      }] });
    }
    if (body.service === 'posts') return ok([
      doc('g1', group), doc('g2', group), doc('u1', 'ordinary_user'),
      doc('g3', otherGroup, 'unrelated'),
    ]);
    return ok(body.sql ? { rows: [] } : {});
  });
  vi.stubGlobal('fetch', transport);
  return transport;
}

describe('anonymous personal author pictures', () => {
  function mockPersonalReads(failure?: 'empty' | 'denied' | 'throw') {
    const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.prepare?.face) {
        expect(url).toBe(`${API_ORIGIN}/v3/query`);
        expect(body).not.toHaveProperty('token');
        expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
        if (body.sql === GROUP_FACE_SQL) return ok({ rows: [{
          group_id: group, author_key: 'ordinary_user', body: { name: 'Music Collective' },
          avatar_url: avatar,
        }] });
        expect(body.sql).toBe(peopleFaceSql(['ordinary_user', 'other_user']));
        expect(body.groups).toEqual([
          `${API_HOST}/groups/users/ordinary_user/followers`,
          `${API_HOST}/groups/users/other_user/followers`,
        ]);
        expect(body.prepare.face).toEqual({ bodyField: 'body', mediaField: 'avatar_ref', urlField: 'avatar_url' });
        if (failure === 'throw') throw new Error('offline');
        if (failure === 'denied') return { ok: false, status: 403 } as Response;
        if (failure === 'empty') return ok({ rows: [] });
        return ok({ rows: [{ author_key: 'ordinary_user', body: { name: 'Personal Name' }, avatar_url: 'https://cdn.example/person.jpg' }] });
      }
      if (body.service === 'posts') return ok([
        doc('u1', 'ordinary_user'), doc('u2', 'ordinary_user'),
        doc('u3', 'other_user'), doc('g1', group),
      ]);
      return ok(body.sql ? { rows: [] } : {});
    });
    vi.stubGlobal('fetch', transport);
    return transport;
  }

  it.each(['feed', 'search'] as const)('loads current personal avatars on %s without photo attachments', async (surface) => {
    const transport = mockPersonalReads();
    const posts = surface === 'feed'
      ? (await fetchDiscoverFeed('recent', 10)).map(mapDiscoveryToFeedPost)
      : await searchDiscoverPosts('matching');
    expect(posts).toHaveLength(4);
    for (const post of posts.filter((p) => p.author === 'ordinary_user')) {
      expect(post.avatarUrl).toBe('https://cdn.example/person.jpg');
    }
    expect(posts.find((p) => p.id === 'u3')?.avatarUrl).toBeUndefined();
    expect(posts.find((p) => p.id === 'g1')).toMatchObject({ name: 'Music Collective', avatarUrl: avatar });
    const personalQueries = transport.mock.calls.filter(([, init]) => {
      const body = JSON.parse(String(init?.body || '{}'));
      return body.prepare && body.sql !== GROUP_FACE_SQL;
    });
    expect(personalQueries).toHaveLength(1);
    render(<TrendingCard post={posts[0]} rank={1} maxScore={1} onLike={() => {}} onComment={() => {}} onRepost={() => {}} />);
    expect(screen.getByRole('img', { name: 'Ordinary user' })).toHaveAttribute('src', 'https://cdn.example/person.jpg');
    expect(screen.getAllByRole('link', { name: /Ordinary user/ })[0]).toHaveAttribute('href', `${SOCIAL_ORIGIN}/u/ordinary_user`);
  });

  it.each(['empty', 'denied', 'throw'] as const)('retains posts and group pictures when personal faces are %s', async (failure) => {
    mockPersonalReads(failure);
    const posts = (await fetchDiscoverFeed('trending', 10)).map(mapDiscoveryToFeedPost);
    expect(posts).toHaveLength(4);
    expect(posts.find((p) => p.id === 'u1')).toMatchObject({ name: 'Ordinary user' });
    expect(posts.find((p) => p.id === 'u1')?.avatarUrl).toBeUndefined();
    expect(posts.find((p) => p.id === 'g1')).toMatchObject({ name: 'Music Collective', avatarUrl: avatar });
  });

  it('uses exact qualified authors and their own provider followers groups', async () => {
    const authors = ['one.example/users/alex', 'two.example/users/alex'];
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.prepare) {
        expect(body.sql).toBe(peopleFaceSql(authors));
        expect(body.groups).toEqual(authors.map((a) => a.replace('/users/', '/groups/users/') + '/followers'));
        return ok({ rows: authors.map((author, i) => ({ author_key: author, avatar_url: `https://cdn.example/${i}.jpg` })) });
      }
      if (body.service === 'posts') return ok(authors.map((a, i) => doc(`u${i}`, a)));
      return ok(body.sql ? { rows: [] } : {});
    });
    vi.stubGlobal('fetch', transport);
    const posts = await fetchDiscoverFeed('recent', 10);
    expect(posts.map((p) => p.avatar_url)).toEqual(['https://cdn.example/0.jpg', 'https://cdn.example/1.jpg']);
    expect(transport.mock.calls.filter(([, init]) => JSON.parse(String(init?.body || '{}')).prepare)).toHaveLength(1);
  });

  it('skips zero-limit and unmatched pages', async () => {
    const transport = mockPersonalReads();
    await fetchDiscoverFeed('recent', 0);
    expect(transport.mock.calls.some(([, init]) => JSON.parse(String(init?.body || '{}')).prepare)).toBe(false);
    transport.mockClear();
    const posts = await searchDiscoverPosts('unmatched');
    expect(posts).toEqual([]);
    expect(transport.mock.calls.some(([, init]) => JSON.parse(String(init?.body || '{}')).prepare)).toBe(false);
  });

  it('does not request personal profiles outside the selected page', async () => {
    const transport = mockReads();
    const posts = await fetchDiscoverFeed('recent', 1);
    expect(posts.map((p) => p.post_id)).toEqual(['g1']);
    const prepared = transport.mock.calls.map(([, init]) => JSON.parse(String(init?.body || '{}'))).filter((body) => body.prepare);
    expect(prepared).toHaveLength(2);
    expect(prepared.every((body) => body.sql === GROUP_FACE_SQL && body.groups.length === 1 && body.groups[0] === group)).toBe(true);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('anonymous feed group identity hydration', () => {
  it('batches exact group ids and carries name/avatar through all feed mappings to group links', async () => {
    const fetchMock = mockReads();
    const posts = (await fetchDiscoverFeed('recent', 10)).map(mapDiscoveryToFeedPost);
    const post = posts.find((p) => p.id === 'g1')!;
    expect(feedPostToDiscover(post)).toMatchObject({
      author: group, display_name: 'Music Collective',
    });
    expect(post.avatarUrl).toBe(avatar);
    const faces = fetchMock.mock.calls.filter(([, init]) => JSON.parse(String(init?.body)).sql === GROUP_FACE_SQL);
    expect(faces).toHaveLength(2);
    for (const [, init] of faces) expect(JSON.parse(String(init?.body)).groups).toEqual([group, otherGroup]);
    render(<TrendingCard post={post} rank={1} maxScore={1} onLike={() => {}} onComment={() => {}} onRepost={() => {}} />);
    expect(screen.getByRole('img', { name: 'Music Collective' })).toHaveAttribute('src', avatar);
    for (const link of screen.getAllByRole('link', { name: /Music Collective/ })) {
      expect(link).toHaveAttribute('href', `${SOCIAL_ORIGIN}/groups/${encodeURIComponent(group)}`);
    }
    const user = posts.find((p) => p.id === 'u1')!;
    expect(feedPostToDiscover(user)).toMatchObject({ author: 'ordinary_user', display_name: 'Ordinary user' });
    expect(user.avatarUrl).toBeUndefined();
  });

  it.each(['empty', 'denied', 'throw'] as const)('keeps posts and ordinary user rendering on %s face reads', async (failure) => {
    mockReads(failure);
    const posts = (await fetchDiscoverFeed('trending', 10)).map(mapDiscoveryToFeedPost);
    expect(posts).toHaveLength(4);
    const groupPost = posts.find((p) => p.id === 'g1')!;
    expect(groupPost.name).toBe('Api.example/groups/creator/music');
    expect(groupPost.avatarUrl).toBeUndefined();
    const user = posts.find((p) => p.id === 'u1')!;
    render(<TrendingCard post={user} rank={1} maxScore={1} onLike={() => {}} onComment={() => {}} onRepost={() => {}} />);
    for (const link of screen.getAllByRole('link', { name: /Ordinary user/ })) {
      expect(link).toHaveAttribute('href', `${SOCIAL_ORIGIN}/u/ordinary_user`);
    }
  });

  it('hydrates matching search results only, deduplicating group authors', async () => {
    const fetchMock = mockReads();
    const posts = await searchDiscoverPosts('matching');
    expect(posts.map((p) => p.id)).toEqual(['g1', 'g2', 'u1']);
    expect(feedPostToDiscover(posts[0])).toMatchObject({ display_name: 'Music Collective' });
    expect(posts[0].avatarUrl).toBe(avatar);
    const faces = fetchMock.mock.calls.filter(([, init]) => JSON.parse(String(init?.body)).sql === GROUP_FACE_SQL);
    expect(faces).toHaveLength(2);
    for (const [, init] of faces) expect(JSON.parse(String(init?.body)).groups).toEqual([group]);
    fetchMock.mockClear();
    expect(await searchDiscoverPosts('ordinary_user')).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([, init]) => JSON.parse(String(init?.body)).sql === GROUP_FACE_SQL)).toBe(false);
  });

  it('preserves group attribution through the page author-link override', async () => {
    mockReads();
    const { default: Trending } = await import('@/pages/Trending');
    render(<MemoryRouter initialEntries={['/trending/hot-gossip?q=matching']}><Trending /></MemoryRouter>);
    const names = await screen.findAllByRole('link', { name: 'Music Collective' });
    for (const link of names) {
      expect(link).toHaveAttribute('href', `${SOCIAL_ORIGIN}/groups/${encodeURIComponent(group)}`);
    }
    expect(screen.getAllByRole('img', { name: 'Music Collective' })[0]).toHaveAttribute('src', avatar);
  });
});
