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
  countStagingPosts: vi.fn().mockResolvedValue(0),
  getMyCollections: vi.fn().mockResolvedValue([]),
  readUserPublicCollections: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/data/wapi', () => ({
  getWapi: () => ({ readToken: () => ({ username: 'author', provider: 'test.localhost' }) }),
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
  vi.mocked(data.readMyPosts).mockResolvedValue([audio, video, ordinary, { ...audio }]);
  vi.mocked(data.readUserPublicProfile).mockResolvedValue({ posts: [audio, video, ordinary] });
});

describe('Author profile Music tab', () => {
  it('deep-links to tagged audio and video once each, passing original posts and owner permissions to ProfileFeed', async () => {
    show();
    await screen.findByTestId('music-posts');
    expect(screen.getByTestId('profile-tab-music')).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByText('Audio track')).toHaveLength(1);
    expect(screen.getAllByText('Music video')).toHaveLength(1);
    expect(screen.queryByText('Other video')).not.toBeInTheDocument();
    expect(feed.mock.lastCall?.[0]).toMatchObject({ posts: [audio, video], isOwnProfile: true });
    expect(feed.mock.lastCall?.[0].posts[1]).toBe(video);
    expect(data.readMyPosts).toHaveBeenCalledWith({ surface: 'profile' });
    expect(screen.queryByTestId('profile-view-toggle')).not.toBeInTheDocument();
  });

  it('filters only the visitor-authorized loaded posts and preserves resolved video media and non-owner permissions', async () => {
    show('/u/visitor?tab=music', 'visitor');
    await screen.findByTestId('music-posts');
    expect(data.readMyPosts).not.toHaveBeenCalled();
    expect(data.readUserPublicProfile).toHaveBeenCalledWith('visitor', 'test.localhost', 50, 'profile');
    expect(feed.mock.lastCall?.[0]).toMatchObject({
      posts: [audio, video], isOwnProfile: false,
      mediaMap: { v: { url: 'https://test/video.mp4', mime_type: 'video/mp4' } },
    });
    expect(screen.queryByTestId('edit-profile-button')).not.toBeInTheDocument();
  });

  it('updates the URL on click, preserves other parameters, and restores the Posts lens', async () => {
    show('/u/author?view=feed&keep=yes');
    await screen.findByTestId('profile-tab-music');
    fireEvent.click(screen.getByTestId('profile-tab-music'));
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('tab=music'));
    expect(screen.getByTestId('url')).toHaveTextContent('view=feed&keep=yes');
    expect(feed.mock.lastCall?.[0].posts).toEqual([audio, video]);
    fireEvent.click(screen.getByTestId('profile-tab-posts'));
    await screen.findByTestId('profile-view-toggle');
    expect(screen.getByTestId('url')).toHaveTextContent('?view=feed&keep=yes');
    expect(feed.mock.lastCall?.[0].posts).toHaveLength(4);
  });

  it('follows browser back and forward between URL tabs without reloading posts', async () => {
    show(undefined, 'author', ['/u/author?tab=media', '/u/author?tab=music']);
    await screen.findByTestId('music-posts');
    fireEvent.click(screen.getByText('Back in history'));
    await waitFor(() => expect(screen.getByTestId('profile-tab-media')).toHaveAttribute('aria-current', 'true'));
    expect(screen.queryByTestId('music-posts')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Forward in history'));
    await screen.findByTestId('music-posts');
    expect(screen.getByTestId('profile-tab-music')).toHaveAttribute('aria-current', 'true');
    expect(data.readMyPosts).toHaveBeenCalledTimes(1);
  });

  it('shows a Music-specific empty state for untagged audio/video and missing tags', async () => {
    vi.mocked(data.readMyPosts).mockResolvedValue([ordinary, { ...audio, tags: undefined }]);
    show();
    expect(await screen.findByTestId('profile-music-empty')).toHaveTextContent('No music yet');
    expect(feed).not.toHaveBeenCalled();
  });

  it('retains the retryable post-read error instead of claiming Music is empty', async () => {
    vi.mocked(data.readMyPosts).mockRejectedValueOnce(new Error('Unavailable'));
    show();
    await screen.findByTestId('profile-posts-error');
    expect(screen.queryByTestId('profile-music-empty')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry posts' }));
    await screen.findByTestId('music-posts');
    expect(feed.mock.lastCall?.[0].posts).toEqual([audio, video]);
  });
});
