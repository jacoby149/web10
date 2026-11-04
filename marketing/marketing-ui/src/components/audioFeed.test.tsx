import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrendingCard, type FeedPost } from './FeedPreview';

const post: FeedPost = {
  id: 'jazz', author: 'api.example/groups/club/music', name: 'Century Club Music',
  handle: '@club', initial: 'C', avatarColor: 'bg-brand-muted', time: '6h',
  content: 'The full recording, attached here.', title: 'Livery Stable Blues',
  likes: '0', comments: '0', reposts: '0', engagementScore: 0,
  likesCount: 0, commentsCount: 0, repostsCount: 0, tags: ['music'],
  createdAt: '2026-11-04T00:00:00Z',
};
const audio = { doc_id: 'song', mime_type: 'audio/mpeg', read_url: 'https://cdn.example/song.mp3', duration_seconds: 180 };
function card(props: Partial<FeedPost> = {}) {
  return render(<TrendingCard post={{ ...post, ...props }} rank={1} maxScore={1} onLike={() => {}} onComment={() => {}} onRepost={() => {}} />);
}
afterEach(cleanup);

describe('Discover audio attachments', () => {
  it('renders a playable recording instead of the decorative music placeholder', () => {
    card({ mediaRefs: [audio] });
    expect(document.querySelector('audio')).toHaveAttribute('src', audio.read_url);
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeInTheDocument();
    expect(document.querySelector('audio')).not.toHaveAttribute('autoplay');
    expect(document.querySelector('.w-2\\/5')).not.toBeInTheDocument();
  });
  it('recognizes untagged audio from resolved MIME, not the post tag', () => {
    card({ tags: [], mediaRefs: [audio] });
    expect(document.querySelector('audio')).toHaveAttribute('src', audio.read_url);
    expect(document.querySelector(`img[src="${audio.read_url}"]`)).not.toBeInTheDocument();
  });
  it('keeps supporting images and audio playable in mixed attachments', () => {
    card({ mediaRefs: [{ doc_id: 'cover', mime_type: 'image/jpeg', read_url: 'https://cdn.example/cover.jpg' }, audio] });
    expect(document.querySelector('audio')).toHaveAttribute('src', audio.read_url);
    expect(document.querySelector(`img[src="${audio.read_url}"]`)).not.toBeInTheDocument();
    expect(document.querySelector('img[src="https://cdn.example/cover.jpg"]')).toBeInTheDocument();
  });
  it('shows unavailable audio rather than fictional progress when the URL is absent', () => {
    card();
    expect(screen.getByText('Audio unavailable')).toBeInTheDocument();
    expect(document.querySelector('.w-2\\/5')).not.toBeInTheDocument();
    expect(screen.getByText('Livery Stable Blues')).toBeInTheDocument();
  });
});
