// Screenshot harness — mock of @/lib/unfurl (the link-unfurl fetch seam).
// The PURE parts re-export the real module (a relative import — the alias
// only swaps the `@/lib/unfurl` specifier); ONLY the network fetch is
// canned, with the exact cards the preview server returns for the seeded
// link-only posts (the verified live shapes: the spotify oEmbed player, the
// paulgraham.com article card).
export { isUnfurlCandidate, UNFURL_PATH, normalizeUnfurlCard } from '../../src/lib/unfurl';
export type { UnfurlCard, UnfurlEmbed } from '../../src/lib/unfurl';

const CARDS: Record<string, any> = {
  'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b': {
    url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
    domain: 'spotify.com',
    provider: 'spotify',
    title: 'Blinding Lights',
    description: 'The Weeknd · Blinding Lights',
    image: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e028863bc11d2aa12b54f5aeb36',
    embed: {
      src: 'https://open.spotify.com/embed/track/0VjIjW4GlUZAMYd2vXMi3b?utm_source=oembed',
      height: 152,
      width: 456,
      allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    },
  },
  'https://paulgraham.com/greatwork.html': {
    url: 'https://paulgraham.com/greatwork.html',
    domain: 'paulgraham.com',
    provider: 'generic',
    title: 'How to Do Great Work',
    description:
      'If you collected lists of techniques for doing great work in a lot of different fields, what would the intersection look like?',
    image: null,
    embed: null,
  },
};

export async function fetchUnfurl(url: string): Promise<any> {
  return CARDS[url.split('#')[0]] ?? null;
}
