// Harness mock for @/data/search (S2). Returns seeded results so the search
// dropdown renders the People/Groups/Posts sections + rows + "see more" links
// without a backend. The seed is query-gated: a query containing "synth"
// returns the populated rows; anything else returns [] (the no-match state).
const HAS_RESULTS = (q: string) => q.toLowerCase().includes('synth');

export async function searchPeople(query: string, _limit = 5) {
  if (!HAS_RESULTS(query)) return [];
  return [
    { username: 'alice', provider: 'web10', display_name: 'Alice Smith', bio: 'Synthwave producer', avatar_url: '', followers_count: 128, is_following: false },
    { username: 'nova', provider: 'web10', display_name: 'Nova', bio: 'Lofi artist', avatar_url: '', followers_count: 542, is_following: true },
  ];
}

export async function searchGroups(query: string, _limit = 5) {
  if (!HAS_RESULTS(query)) return [];
  return [
    { group_id: 'web10/groups/users/nova/synthwave-sessions', name: 'Synthwave Sessions', owner: 'nova', slug: 'synthwave-sessions', join_policy: 'open', member_count: 128, tags: ['music'], permission_summary: 'public' },
    { group_id: 'web10/groups/users/kai/lofi-study-room', name: 'Lofi Study Room', owner: 'kai', slug: 'lofi-study-room', join_policy: 'open', member_count: 64, tags: ['study'], permission_summary: 'public' },
  ];
}

export async function searchPosts(query: string, _limit = 5) {
  if (!HAS_RESULTS(query)) return [];
  return [
    { _id: 'sp-1', text: 'Check out this synthwave mix I made last night', author_username: 'alice', created_at: '2026-01-01T00:00:00Z' },
    { _id: 'sp-2', text: 'Synthwave is back and it is absolutely beautiful', author_username: 'nova', created_at: '2026-01-02T00:00:00Z' },
  ];
}

export async function searchVideo(query: string, _limit = 5) {
  if (!HAS_RESULTS(query)) return [];
  return [
    { _id: 'sv-1', text: 'Synthwave video mix — full 4K render', author_username: 'alice', tags: ['video'], created_at: '2026-01-01T00:00:00Z' },
    { _id: 'sv-2', text: 'Behind the scenes of the synthwave session', author_username: 'nova', tags: ['video'], created_at: '2026-01-02T00:00:00Z' },
  ];
}

export async function searchShorts(query: string, _limit = 5) {
  if (!HAS_RESULTS(query)) return [];
  return [
    { post: { _id: 'ss-1', text: 'Synthwave in 15 seconds', author_username: 'alice', created_at: '2026-01-01T00:00:00Z' }, media: { _id: 'm-ss-1', mime_type: 'video/mp4', width: 720, height: 1280 } },
    { post: { _id: 'ss-2', text: 'Lofi study short', author_username: 'kai', created_at: '2026-01-02T00:00:00Z' }, media: { _id: 'm-ss-2', mime_type: 'video/mp4', width: 720, height: 1280 } },
  ];
}
