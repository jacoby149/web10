import type { PostRecord } from '../src/data/types';
export { readFeedReactions } from './harness/mock-data';
const photo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#164e63"/><path d="M0 600L300 130L520 440L780 100L1200 600" fill="#0f766e"/><path d="M0 600L520 260L900 600" fill="#134e4a"/><path d="M570 600Q480 400 620 320" fill="none" stroke="#d6d3d1" stroke-width="45"/></svg>')}`;
const posts: PostRecord[] = [
  { _id: 'walking-one', author_key: 'nova', author_username: 'nova', profile: { display_name: 'Nova Lane' }, visibility: 'public', created_at: '2026-11-12T07:00:00Z',
    text: 'No notifications. No rush. Just the long way home.\n\n#Walking #Outside', hashtags: ['walking', 'outside'], likes: 24, comments: 3, reposts: 2,
    media_refs: [{ doc_id: 'trail', read_url: photo, mime_type: 'image/svg+xml', width: 1200, height: 600 }] },
  { _id: 'walking-two', author_key: 'kai', author_username: 'kai', profile: { display_name: 'Kai Moreno' }, visibility: 'public', created_at: '2026-11-12T06:00:00Z',
    text: 'A small reminder to look up once in a while. #walking', hashtags: ['walking'], likes: 8, comments: 1 },
];
export async function readHashtagBoard(tag: string) {
  const state = new URLSearchParams(window.location.search).get('state');
  if (state === 'loading') await new Promise(() => {});
  if (state === 'error') throw new Error('Synthetic offline fixture');
  return { posts: state === 'empty' || tag !== 'walking' ? [] : posts, has_more: false, next_cursor: null };
}
