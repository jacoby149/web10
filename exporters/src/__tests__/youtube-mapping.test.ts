import { describe, it, expect } from 'vitest'
import {
  mapYouTubeVideo,
  mapYouTubeComment,
  mapYouTubeChannel,
  isYouTubeZip,
  detectYouTubeFile,
} from '../youtube/mapping'
import type { ZipEntry } from '../zip'

describe('isYouTubeZip', () => {
  it('detects youtube archive', () => {
    const entries: ZipEntry[] = [
      { path: 'Takeout/YouTube/video.json', text: async () => '', blob: async () => new Blob() },
    ]
    expect(isYouTubeZip(entries)).toBe(true)
  })

  it('rejects non-youtube', () => {
    const entries: ZipEntry[] = [
      { path: 'photos/vacation.jpg', text: async () => '', blob: async () => new Blob() },
    ]
    expect(isYouTubeZip(entries)).toBe(false)
  })
})

describe('detectYouTubeFile', () => {
  it('detects video file', () => {
    expect(detectYouTubeFile({ path: 'YouTube/video.json', text: async () => '', blob: async () => new Blob() })).toBe('video')
  })

  it('detects comment file', () => {
    expect(detectYouTubeFile({ path: 'YouTube/comment.json', text: async () => '', blob: async () => new Blob() })).toBe('comment')
  })

  it('detects channel file', () => {
    expect(detectYouTubeFile({ path: 'YouTube/my channels.json', text: async () => '', blob: async () => new Blob() })).toBe('channel')
  })

  it('returns null for unknown', () => {
    expect(detectYouTubeFile({ path: 'random.json', text: async () => '', blob: async () => new Blob() })).toBe(null)
  })
})

describe('mapYouTubeVideo', () => {
  it('maps a basic video', () => {
    const records = mapYouTubeVideo({
      id: 'vid123',
      snippet: {
        title: 'My Video',
        description: 'A great video #web10',
        publishedAt: '2024-01-15T10:30:00Z',
        thumbnails: {
          high: { url: 'https://i.ytimg.com/vi/vid123/hqdefault.jpg', width: 480, height: 360 },
        },
      },
      contentDetails: {
        duration: 'PT10M30S',
      },
      statistics: {
        viewCount: '1000',
        likeCount: '50',
        commentCount: '10',
      },
      status: {
        privacyStatus: 'public',
      },
    })

    expect(records).toHaveLength(2)
    const post = records.find(r => r.service === 'posts')
    const media = records.find(r => r.service === 'media')

    expect(post).toBeDefined()
    expect(post!.origin).toBe('youtube')
    expect(post!.body.text).toContain('My Video')
    expect(post!.body.tags).toEqual(['web10'])
    expect(post!.body.visibility).toBe('public')
    expect(post!.body.duration_seconds).toBe(630)

    expect(media).toBeDefined()
    expect(media!.body.url).toBe('https://i.ytimg.com/vi/vid123/hqdefault.jpg')
    expect(media!.body.width).toBe(480)
  })

  it('maps unlisted as friends visibility', () => {
    const records = mapYouTubeVideo({
      id: 'vid2',
      snippet: { title: 'Unlisted', publishedAt: '2024-01-01T00:00:00Z' },
      status: { privacyStatus: 'unlisted' },
    })
    expect(records[0].body.visibility).toBe('friends')
  })

  it('maps private visibility', () => {
    const records = mapYouTubeVideo({
      id: 'vid3',
      snippet: { title: 'Private', publishedAt: '2024-01-01T00:00:00Z' },
      status: { privacyStatus: 'private' },
    })
    expect(records[0].body.visibility).toBe('private')
  })
})

describe('mapYouTubeComment', () => {
  it('maps a comment', () => {
    const record = mapYouTubeComment({
      id: 'comment1',
      snippet: {
        topLevelCommentId: 'top1',
        videoId: 'vid123',
        textDisplay: 'Great video!',
        publishedAt: '2024-01-01T01:00:00Z',
        authorDisplayName: 'Viewer',
      },
    })

    expect(record).not.toBeNull()
    expect(record!.body.post_id).toBe('vid123')
    expect(record!.body.text).toBe('Great video!')
    expect(record!.body.author_username).toBe('viewer')
    expect(record!.body.author_provider).toBe('youtube')
  })

  it('maps a reply with parent_id', () => {
    const record = mapYouTubeComment({
      id: 'reply1',
      snippet: {
        topLevelCommentId: 'top1',
        parentId: 'parent1',
        textDisplay: 'Reply!',
        publishedAt: '2024-01-01T02:00:00Z',
      },
    })

    expect(record).not.toBeNull()
    expect(record!.body.parent_id).toBe('parent1')
  })

  it('returns null for empty comment', () => {
    expect(mapYouTubeComment({})).toBeNull()
  })
})

describe('mapYouTubeChannel', () => {
  it('maps a channel to profile', () => {
    const record = mapYouTubeChannel({
      id: 'ch1',
      snippet: {
        title: 'My Channel',
        description: 'Cool stuff',
        customUrl: '@mychannel',
      },
    })

    expect(record).not.toBeNull()
    expect(record!.service).toBe('profile')
    expect(record!.body.display_name).toBe('My Channel')
    expect(record!.body.bio).toBe('Cool stuff')
    expect(record!.body.website).toBe('https://youtube.com@mychannel')
  })

  it('returns null for empty channel', () => {
    expect(mapYouTubeChannel({})).toBeNull()
  })
})
