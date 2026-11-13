// 1,000 distinct topics through the actual Discover board, without a live node.
export * from './harness/mock-data';
import { readDiscoverFeed as seedFeed } from './harness/mock-data';
import type { PostRecord } from '../src/data/types';
import { photo } from './hashtags-fixture';

export async function readDiscoverFeed(): Promise<unknown[]> {
  const seeds = await seedFeed();
  if (!window.location.pathname.startsWith('/hashtag-fixture/topics')) return seeds;
  const topics = ['architecture', 'art', 'cooking', 'music', 'photography', 'short',
    ...Array.from({ length: 994 }, (_, index) => `topic_${String(index + 6).padStart(4, '0')}`)];
  topics[6] = 'photography_and_weekend_hiking';
  return Array.from({ length: 40 }, (_, index) => ({
    ...(seeds[index % seeds.length] as PostRecord), _id: `topic-fixture-${index}`,
    text: `A little fresh air, and a different way home. #${topics[index * 25]}`,
    tags: [], hashtags: topics.slice(index * 25, (index + 1) * 25),
    media_refs: index === 0 ? [{ doc_id: 'topic-photo', mime_type: 'image/svg+xml', read_url: photo, width: 1200, height: 600 }] : [],
    created_at: new Date(Date.now() - index * 60_000).toISOString(),
  }));
}
