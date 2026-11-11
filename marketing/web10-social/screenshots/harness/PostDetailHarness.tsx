// Screenshot harness — a seeded PostLightbox (the post-detail system) so the
// full-post layout can be captured without the docker stack. Renders a
// TEXT-ONLY post (no media) with a markdown body, to prove the content-sized
// modal: a centered reading column (max-w-prose), not 320px-in-896px dead
// space. The post is the owner's (isOwner=true) so the ⋯ owner menu shows.
import { MemoryRouter } from 'react-router-dom';
import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { PostRecord } from '@/data/types';
import { MUSIC_TRACKS } from './mock-music';

const POST: PostRecord = {
  _id: 'pd-1',
  title: 'The North Face, free solo',
  text: [
    'The morning I finally went up the north face, the air was so still you could hear the rope creak.',
    '',
    '## Why I went',
    '',
    'It was never about the summit. It was about the **long way up** — the line no one else would take, the one that asks you to be *honest* about what you can hold.',
    '',
    '- The start: a 4am alarm, a cold coffee, no plan B',
    '- The middle: a rest stop where I almost turned around',
    '- The end: the ridge, and the whole valley below',
    '',
    '> The mountain does not care about your résumé. It only cares whether you keep moving.',
    '',
    'Read the full write-up at [the climb log](https://example.com/climb).',
  ].join('\n'),
  created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  visibility: 'public',
  author_username: 'nova',
  author_provider: 'web10',
};

export function PostDetailHarness({ group = false, audio = false }: { group?: boolean; audio?: boolean }) {
  // The audio variant: a seeded music post (the `music` tag + one wav) — the
  // lightbox's music-track slide (the shared AudioPlayer + the album art),
  // the "profile mp3 posts don't play" capture.
  if (audio) {
    const track = MUSIC_TRACKS[0];
    return (
      <MemoryRouter>
        <div className="flex min-h-screen items-center justify-center bg-background" data-testid="post-detail-harness">
          <PostLightbox
            post={track.post}
            mediaMap={{ [track.media._id]: track.media }}
            onClose={() => {}}
            postAuthor={track.post.author_username || 'nova'}
            postService="public_posts"
            isOwner={true}
          />
        </div>
      </MemoryRouter>
    );
  }
  return (
    <MemoryRouter>
      <div className="flex min-h-screen items-center justify-center bg-background" data-testid="post-detail-harness">
        <PostLightbox
          post={group ? { ...POST, author_key: 'web10/groups/users/me/studio', author_username: 'Northstar Studio', posted_by: 'another-operator' } : POST}
          mediaMap={{}}
          onClose={() => {}}
          postAuthor="nova"
          postService="public_posts"
          isOwner={true}
        />
      </div>
    </MemoryRouter>
  );
}
