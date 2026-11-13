import { describe, expect, it } from 'vitest';
import { musicQueueFromPosts } from '@/data/musicTrack';
import type { PostRecord } from '@/data/types';

const song: PostRecord = { _id: 'song', tags: ['music'], media_refs: ['recording'], created_at: '' };
const audio = { _id: 'recording', url: 'https://media.test/song', mime_type: 'audio/mpeg', created_at: '' };

describe('loaded feed music queue', () => {
  it('keeps visible display order, deduplicates exact sources and includes eligible music videos only', () => {
    const remote = { ...song, source_origin: 'https://foreign.test', source_key: 'foreign/song' };
    const video = { ...song, _id: 'video' };
    const queue = musicQueueFromPosts([song, { ...song, tags: [] }, song, remote, video, { ...song, media_refs: ['unresolved'] }],
      post => [{ ...audio, mime_type: post._id === 'video' ? 'video/mp4' : 'audio/mpeg' }], post => !!post.source_origin);
    expect(queue.map(track => track.post.source_key || track.post._id)).toEqual(['song', 'foreign/song', 'video']);
    expect(queue.map(track => track.readOnlySource)).toEqual([false, true, false]);
    expect(queue[2].media.mime_type).toBe('video/mp4');
  });

  it('never includes unresolved or non-music media or blank identities', () => {
    expect(musicQueueFromPosts([{ ...song, _id: undefined }, { ...song, _id: 'unresolved' }],
      post => post._id === 'unresolved' ? [] : [audio], () => false)).toEqual([]);
  });
});
