import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { GROUP_FACE_SQL } from '@web10/discover';
import { fetchDiscoverFeed, searchDiscoverPosts, mapDiscoveryToFeedPost, feedPostToDiscover, TrendingCard } from './FeedPreview';
import { API_ORIGIN, SOCIAL_ORIGIN } from '@/lib/origins';

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
    const faces = fetchMock.mock.calls.filter(([, init]) => JSON.parse(String(init?.body)).prepare);
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
    const faces = fetchMock.mock.calls.filter(([, init]) => JSON.parse(String(init?.body)).prepare);
    expect(faces).toHaveLength(2);
    for (const [, init] of faces) expect(JSON.parse(String(init?.body)).groups).toEqual([group]);
    fetchMock.mockClear();
    expect(await searchDiscoverPosts('ordinary_user')).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([, init]) => JSON.parse(String(init?.body)).prepare)).toBe(false);
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
