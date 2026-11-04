import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import '@testing-library/jest-dom';
import type { ComponentProps } from 'react';
import type { ProfileFeed } from '@/components/Bio/ProfileFeed';
import type { PostRecord } from '@/data/types';
import { lucideMock } from './helpers/lucideMock';

vi.mock('lucide-react', () => lucideMock);
vi.mock('@/data', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/data')>(),
  readProfile: vi.fn().mockResolvedValue({ display_name: 'Author' }),
  readUserProfile: vi.fn().mockResolvedValue({ display_name: 'Author' }),
  readMyPosts: vi.fn().mockResolvedValue([]),
  readUserPublicProfile: vi.fn().mockResolvedValue({ posts: [] }),
  resolveMediaRefs: vi.fn().mockResolvedValue([]),
  readFollow: vi.fn().mockResolvedValue(null),
  countFollows: vi.fn().mockResolvedValue(0),
  countFollowers: vi.fn().mockResolvedValue(0),
  countUserFollowingReal: vi.fn().mockResolvedValue(0),
  getMyCollections: vi.fn().mockResolvedValue([]),
  readUserPublicCollections: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/data/wapi', () => ({
  getWapi: () => ({ readToken: () => ({ username: 'author', provider: 'test.localhost' }) }),
}));
vi.mock('@/components/Bio/PostLightbox', () => ({
  PostLightbox: ({ post }: { post: PostRecord }) => <div data-testid="opened-post">{post._id}</div>,
}));

// Observe the existing renderer's inputs without replacing media playback logic.
const feed = vi.hoisted(() => vi.fn());
vi.mock('@/components/Bio/ProfileFeed', () => ({
  ProfileFeed: (props: ComponentProps<typeof ProfileFeed>) => {
    feed(props);
    return <div data-testid="music-posts">{props.posts.map((post) => <p key={post._id}>{post.title}</p>)}</div>;
  },
}));

import UserProfileScreen from '@/components/Bio/UserProfileScreen';
import * as data from '@/data';

const audio: PostRecord = {
  _id: 'audio', title: 'Audio track', tags: ['music'], created_at: '',
  media_refs: [{ doc_id: 'a', read_url: 'https://test/audio.mp3', mime_type: 'audio/mpeg' }],
};
const video: PostRecord = {
  _id: 'video', title: 'Music video', tags: ['video', 'music', 'music'], created_at: '',
  media_refs: [{ doc_id: 'v', read_url: 'https://test/video.mp4', mime_type: 'video/mp4' }],
};
const ordinary: PostRecord = {
  _id: 'ordinary', title: 'Other video', tags: ['video'], created_at: '', media_refs: video.media_refs,
};

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="url">{location.search}</output>
    <button onClick={() => navigate(-1)}>Back in history</button>
    <button onClick={() => navigate(1)}>Forward in history</button>
  </>;
}

function show(entry = '/u/author?tab=music', username = 'author', entries = [entry]) {
  return render(<MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
    <UserProfileScreen username={username} provider="test.localhost" />
    <Navigation />
  </MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(data.readMyPosts).mockResolvedValue([audio, video, ordinary]);
  vi.mocked(data.readUserPublicProfile).mockResolvedValue({ posts: [audio, video, ordinary] });
  vi.mocked(data.resolveMediaRefs).mockResolvedValue([
    { _id: 'a', url: 'https://test/audio.mp3', mime_type: 'audio/mpeg', created_at: '' },
    { _id: 'v', url: 'https://test/video.mp4', mime_type: 'video/mp4', created_at: '' },
  ]);
});

describe('Profile music in Posts and Media, not a separate tab', () => {
  it('redirects legacy Music links to Media without discarding other URL state', async () => {
    show('/u/author?tab=music&view=feed&keep=yes');
    await screen.findByTestId('profile-tab-media');
    expect(screen.queryByTestId('profile-tab-music')).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-tab-media')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('url')).toHaveTextContent('?tab=media&view=feed&keep=yes');
    expect(screen.getAllByTestId('profile-media-cell')).toHaveLength(3);
    expect(feed).not.toHaveBeenCalled();
  });

  it('keeps music and ordinary posts together in the owner Posts feed', async () => {
    show('/u/author?view=feed');
    await screen.findByTestId('music-posts');
    expect(screen.queryByTestId('profile-tab-music')).not.toBeInTheDocument();
    expect(feed.mock.lastCall?.[0]).toMatchObject({ posts: [audio, video, ordinary], isOwnProfile: true });
    expect(data.readMyPosts).toHaveBeenCalledWith({ surface: 'profile' });
    expect(screen.getByTestId('profile-view-toggle')).toBeInTheDocument();
  });

  it('renders audio as a media tile, not an image sourced from an MP3, and opens its original post', async () => {
    show();
    const tile = await screen.findByTestId('profile-media-cell-audio');
    expect(tile).toHaveTextContent('Audio track');
    expect(tile.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View Audio track' }));
    expect(screen.getByTestId('opened-post')).toHaveTextContent('audio');
  });

  it('retains visitor-authorized music and ordinary posts with non-owner feed permissions', async () => {
    show('/u/visitor?view=feed', 'visitor');
    await screen.findByTestId('music-posts');
    expect(data.readMyPosts).not.toHaveBeenCalled();
    expect(data.readUserPublicProfile).toHaveBeenCalledWith('visitor', 'test.localhost', 50, 'profile');
    expect(feed.mock.lastCall?.[0]).toMatchObject({
      posts: [audio, video, ordinary], isOwnProfile: false,
      mediaMap: { v: { url: 'https://test/video.mp4', mime_type: 'video/mp4' } },
    });
    expect(screen.queryByTestId('edit-profile-button')).not.toBeInTheDocument();
  });

  it('shows visitor-authorized audio and video together in Media', async () => {
    show('/u/visitor?tab=media', 'visitor');
    await screen.findByTestId('profile-media-cell-audio');
    expect(screen.getAllByTestId('profile-media-cell')).toHaveLength(3);
    expect(screen.queryByTestId('profile-tab-music')).not.toBeInTheDocument();
    expect(data.resolveMediaRefs).not.toHaveBeenCalled();
  });

  it('shows audio cover art in the Posts grid without treating the audio URL as an image', async () => {
    vi.mocked(data.resolveMediaRefs).mockResolvedValue([
      { _id: 'a', url: 'https://test/audio.mp3', mime_type: 'audio/mpeg', thumbnail_url: 'https://test/cover.jpg', created_at: '' },
    ]);
    show('/u/author');
    const tile = await screen.findByTestId('profile-post-cell-audio');
    expect(tile.querySelector('img')).toHaveAttribute('src', 'https://test/cover.jpg');
    expect(screen.getAllByTestId('profile-post-cell')).toHaveLength(3);
    fireEvent.keyDown(screen.getByRole('button', { name: 'View Audio track' }), { key: 'Enter' });
    expect(screen.getByTestId('opened-post')).toHaveTextContent('audio');
  });

  it('switches between Media and Posts while preserving the Posts lens and other URL parameters', async () => {
    show('/u/author?view=feed&keep=yes');
    await screen.findByTestId('profile-tab-media');
    fireEvent.click(screen.getByTestId('profile-tab-media'));
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('tab=media'));
    expect(screen.getByTestId('url')).toHaveTextContent('view=feed&keep=yes');
    expect(screen.getByTestId('profile-media-cell-audio')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('profile-tab-posts'));
    await screen.findByTestId('profile-view-toggle');
    expect(screen.getByTestId('url')).toHaveTextContent('?view=feed&keep=yes');
    expect(feed.mock.lastCall?.[0].posts).toEqual([audio, video, ordinary]);
  });

  it('follows browser back and forward between URL tabs without reloading posts', async () => {
    show(undefined, 'author', ['/u/author?tab=media', '/u/author?view=feed']);
    await screen.findByTestId('music-posts');
    fireEvent.click(screen.getByText('Back in history'));
    await waitFor(() => expect(screen.getByTestId('profile-tab-media')).toHaveAttribute('aria-current', 'true'));
    expect(screen.queryByTestId('music-posts')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Forward in history'));
    await screen.findByTestId('music-posts');
    expect(screen.getByTestId('profile-tab-posts')).toHaveAttribute('aria-current', 'true');
    expect(data.readMyPosts).toHaveBeenCalledTimes(1);
  });

  it('uses the normal Media empty state, without a Music tab or empty state', async () => {
    vi.mocked(data.readMyPosts).mockResolvedValue([]);
    show();
    expect(await screen.findByText('No media yet')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-tab-music')).not.toBeInTheDocument();
    expect(feed).not.toHaveBeenCalled();
  });

  it('retains the retryable post-read error on legacy Music links', async () => {
    vi.mocked(data.readMyPosts).mockRejectedValueOnce(new Error('Unavailable'));
    show();
    await screen.findByTestId('profile-posts-error');
    expect(screen.queryByTestId('profile-music-empty')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry posts' }));
    await screen.findByTestId('profile-media-cell-audio');
    expect(screen.queryByTestId('profile-posts-error')).not.toBeInTheDocument();
  });
});
