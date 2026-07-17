import { describe, it, expect } from 'vitest'
import {
  mapInstagramPost,
  mapInstagramProfile,
  mapInstagramFollows,
  isInstagramZip,
} from '../instagram/mapping'
import type { ZipEntry } from '../zip'

describe('isInstagramZip', () => {
  it('detects instagram archive by path', () => {
    const entries: ZipEntry[] = [
      { path: 'Your Instagram and basic information/index.json', text: async () => '', blob: async () => new Blob() },
    ]
    expect(isInstagramZip(entries)).toBe(true)
  })

  it('detects instagram archive by posts/ prefix', () => {
    const entries: ZipEntry[] = [
      { path: 'posts/abc123.json', text: async () => '', blob: async () => new Blob() },
    ]
    expect(isInstagramZip(entries)).toBe(true)
  })

  it('rejects non-instagram archive', () => {
    const entries: ZipEntry[] = [
      { path: 'photos/vacation.jpg', text: async () => '', blob: async () => new Blob() },
    ]
    expect(isInstagramZip(entries)).toBe(false)
  })
})

describe('mapInstagramPost', () => {
  it('maps a basic text post', () => {
    const records = mapInstagramPost({
      post_id: '12345',
      post_text: 'Hello world #web10',
      post_timestamp: '2024-01-15T10:30:00Z',
    })

    expect(records).toHaveLength(1)
    const post = records[0]
    expect(post.service).toBe('posts')
    expect(post.origin).toBe('instagram')
    expect(post.originId).toBe('12345')
    expect(post.body.text).toBe('Hello world #web10')
    expect(post.body.created_at).toBe('2024-01-15T10:30:00.000Z')
    expect(post.body.tags).toEqual(['web10'])
  })

  it('maps mentions from text', () => {
    const records = mapInstagramPost({
      post_id: '99',
      post_text: 'Check out @friend and @another',
      post_timestamp: '2024-01-01T00:00:00Z',
    })

    const mentions = records[0].body.mentions as Array<{ username: string; provider: string }>
    expect(mentions).toHaveLength(2)
    expect(mentions[0].provider).toBe('instagram')
  })

  it('maps tagged users from JSON', () => {
    const records = mapInstagramPost({
      post_id: '88',
      post_text: 'Great day',
      post_timestamp: '2024-01-01T00:00:00Z',
      tagged_users: JSON.stringify([{ username: 'tagged_user' }]),
    })

    const mentions = records[0].body.mentions as Array<{ username: string; provider: string }>
    expect(mentions).toHaveLength(1)
    expect(mentions[0].username).toBe('tagged_user')
  })

  it('maps location data', () => {
    const records = mapInstagramPost({
      post_id: '77',
      post_text: 'At the beach',
      post_timestamp: '2024-01-01T00:00:00Z',
      post_location: 'Santa Monica',
      post_latitude: '34.0195',
      post_longitude: '-118.4912',
    })

    const loc = records[0].body.location as { name?: string; lat?: number; lon?: number }
    expect(loc.name).toBe('Santa Monica')
    expect(loc.lat).toBeCloseTo(34.0195)
    expect(loc.lon).toBeCloseTo(-118.4912)
  })

  it('maps media entries', () => {
    const records = mapInstagramPost({
      post_id: '66',
      post_text: 'Photo',
      post_timestamp: '2024-01-01T00:00:00Z',
      media: [
        {
          media_id: 'media_1',
          media_filename: 'photo.jpg',
          media_width: '1080',
          media_height: '1080',
          media_type: 'Photo',
        },
      ],
    })

    expect(records).toHaveLength(2)
    expect(records[0].service).toBe('posts')
    expect(records[1].service).toBe('media')
    expect(records[1].body.width).toBe(1080)
    expect(records[1].body.height).toBe(1080)
  })

  it('maps comments', () => {
    const records = mapInstagramPost({
      post_id: '55',
      post_text: 'Post',
      post_timestamp: '2024-01-01T00:00:00Z',
      comments: [
        {
          comment_id: 'c1',
          comment_body: 'Nice!',
          comment_timestamp: '2024-01-01T01:00:00Z',
          comment_owner_username: 'commenter',
        },
      ],
    })

    const comment = records.find(r => r.service === 'comments')
    expect(comment).toBeDefined()
    expect(comment?.body.post_id).toBe('55')
    expect(comment?.body.text).toBe('Nice!')
    expect(comment?.body.author_username).toBe('commenter')
  })

  it('maps child comments with parent_id', () => {
    const records = mapInstagramPost({
      post_id: '44',
      post_text: 'Post',
      post_timestamp: '2024-01-01T00:00:00Z',
      comments: [
        {
          comment_id: 'parent',
          comment_body: 'Parent',
          comment_timestamp: '2024-01-01T01:00:00Z',
          child_comments: [
            {
              comment_id: 'child',
              comment_body: 'Reply',
              comment_timestamp: '2024-01-01T02:00:00Z',
            },
          ],
        },
      ],
    })

    const child = records.find(r => r.originId === 'child')
    expect(child).toBeDefined()
    expect(child?.body.parent_id).toBe('parent')
  })

  it('handles empty post text', () => {
    const records = mapInstagramPost({
      post_id: '33',
      post_timestamp: '2024-01-01T00:00:00Z',
    })

    expect(records).toHaveLength(1)
    expect(records[0].body.text).toBeUndefined()
  })
})

describe('mapInstagramProfile', () => {
  it('maps profile fields', () => {
    const record = mapInstagramProfile({
      full_name: 'Jane Doe',
      biography: 'Software engineer | Cat lover',
      external_url: 'https://janedoe.com',
      username: 'janedoe',
    })

    expect(record.service).toBe('profile')
    expect(record.body.display_name).toBe('Jane Doe')
    expect(record.body.bio).toBe('Software engineer | Cat lover')
    expect(record.body.website).toBe('https://janedoe.com')
  })

  it('handles missing fields gracefully', () => {
    const record = mapInstagramProfile({})
    expect(record.service).toBe('profile')
    expect(record.body.display_name).toBeUndefined()
  })
})

describe('mapInstagramFollows', () => {
  it('maps relationships to contacts', () => {
    const records = mapInstagramFollows([
      { user_id: '1', username: 'alice', full_name: 'Alice Smith' },
      { user_id: '2', username: 'bob' },
    ])

    expect(records).toHaveLength(2)
    expect(records[0].service).toBe('contacts')
    expect(records[0].body.username).toBe('alice')
    expect(records[0].body.provider).toBe('instagram')
    expect(records[0].body.display_name).toBe('Alice Smith')
    expect(records[1].body.display_name).toBeUndefined()
  })

  it('skips entries without username', () => {
    const records = mapInstagramFollows([
      { user_id: '1', full_name: 'No Username' },
    ])
    expect(records).toHaveLength(0)
  })
})
