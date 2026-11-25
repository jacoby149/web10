// Screenshot harness — a seeded PostLightbox (the post-detail system) so the
// full-post layout can be captured without the docker stack. Renders a
// TEXT-ONLY post (no media) with a markdown body, to prove the content-sized
// modal: a centered reading column (max-w-prose), not 320px-in-896px dead
// space. The post is the owner's (isOwner=true) so the ⋯ owner menu shows.
import { MemoryRouter } from 'react-router-dom';
import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { MediaRecord, PostRecord } from '@/data/types';
import { MUSIC_TRACKS } from './mock-music';
import { ESSAY_TEXT } from './mock-data';

// A portrait (9:16) photo creative — the lightbox's "photobox" cap evidence
// (60vh desktop frame + the black side bars, the grainy-feed PR).
const PORTRAIT_PHOTO_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='720' height='1280'>` +
  `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
  `<stop offset='0' stop-color='#f59e0b'/><stop offset='1' stop-color='#78350f'/>` +
  `</linearGradient></defs>` +
  `<rect width='720' height='1280' fill='url(#g)'/>` +
  `<text x='40' y='640' font-family='sans-serif' font-size='160' font-weight='700' fill='white'>TALL SHOT</text>` +
  `</svg>`;
const PORTRAIT_PHOTO: MediaRecord = {
  _id: 'pd-photo',
  url: `data:image/svg+xml;utf8,${encodeURIComponent(PORTRAIT_PHOTO_SVG)}`,
  created_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
  mime_type: 'image/png',
  width: 720,
  height: 1280,
};
const PORTRAIT_POST: PostRecord = {
  _id: 'pd-portrait',
  title: 'Staaabucks',
  text: 'Waking up at 5AM, going to staaabucks, waking up early to do work younowaimsayin!!!!!!!!',
  created_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
  visibility: 'public',
  author_username: 'nova',
  author_provider: 'web10',
  media_refs: ['pd-photo'],
};

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

// The D125 essay variant: a text-only post whose body is essay-length (the
// operator's "a post that takes over the feed" case) — the lightbox capture
// shows the detail's 12-line clamp + the "See more" toggle.
const ESSAY_POST: PostRecord = {
  ...POST,
  _id: 'pd-essay',
  title: 'The long way around',
  text: ESSAY_TEXT,
};

export function PostDetailHarness({ group = false, audio = false, portrait = false, essay = false }: { group?: boolean; audio?: boolean; portrait?: boolean; essay?: boolean }) {
  // The portrait variant: a tall photo post — the lightbox's "photobox" cap
  // (60vh desktop frame + the black side bars) capture.
  if (portrait) {
    return (
      <MemoryRouter>
        <div className="flex min-h-screen items-center justify-center bg-background" data-testid="post-detail-harness">
          <PostLightbox
            post={PORTRAIT_POST}
            mediaMap={{ 'pd-photo': PORTRAIT_PHOTO }}
            onClose={() => {}}
            postAuthor="nova"
            postService="public_posts"
            isOwner={true}
          />
        </div>
      </MemoryRouter>
    );
  }
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
  const post = essay ? ESSAY_POST : group ? { ...POST, author_key: 'web10/groups/users/me/studio', author_username: 'Northstar Studio', posted_by: 'another-operator' } : POST;
  return (
    <MemoryRouter>
      <div className="flex min-h-screen items-center justify-center bg-background" data-testid="post-detail-harness">
        <PostLightbox
          post={post}
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
