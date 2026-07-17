import { describe, it, expect } from 'vitest'
import {
  mapFacebookPost,
  mapFacebookPhoto,
  mapFacebookFriend,
  mapFacebookComment,
  isFacebookZip,
  detectFacebookFile,
} from '../facebook/mapping'
import type { ZipEntry } from '../zip'

describe('isFacebookZip', () => {
  it('detects facebook archive', () => {
    const entries: ZipEntry[] = [
      { path: 'Facebook/your posts.json', text: async () => '', blob: async () => new Blob() },
    ]
    expect(isFacebookZip(entries)).toBe(true)
  })

  it('detects by friends list', () => {
    const entries: ZipEntry[] = [
      { path: 'Your friends list.json', text: async () => '', blob: async () => new Blob() },
    ]
    expect(isFacebookZip(entries)).toBe(true)
  })

  it('rejects non-facebook', () => {
    const entries: ZipEntry[] = [
      { path: 'photos/vacation.jpg', text: async () => '', blob: async () => new Blob() },
    ]
    expect(isFacebookZip(entries)).toBe(false)
  })
})

describe('detectFacebookFile', () => {
  it('detects posts file', () => {
    expect(detectFacebookFile({ path: 'Your posts.json', text: async () => '', blob: async () => new Blob() })).toBe('post')
  })

  it('detects photos file', () => {
    expect(detectFacebookFile({ path: 'Photos/Your photos.json', text: async () => '', blob: async () => new Blob() })).toBe('photo')
  })

  it('detects friends file', () => {
    expect(detectFacebookFile({ path: 'Your friends list.json', text: async () => '', blob: async () => new Blob() })).toBe('friend')
  })

  it('detects comments file', () => {
    expect(detectFacebookFile({ path: 'Your comments.json', text: async () => '', blob: async () => new Blob() })).toBe('comment')
  })

  it('returns null for unknown', () => {
    expect(detectFacebookFile({ path: 'random.json', text: async () => '', blob: async () => new Blob() })).toBe(null)
  })
})

describe('mapFacebookPost', () => {
  it('maps a basic post', () => {
    const record = mapFacebookPost({
      'Post text': 'Hello Facebook #web10',
      'Post created time': '2024-01-15 10:30:00',
      'Post ID': '12345',
    })

    expect(record).not.toBeNull()
    expect(record!.service).toBe('posts')
    expect(record!.origin).toBe('facebook')
    expect(record!.body.text).toBe('Hello Facebook #web10')
    expect(record!.body.tags).toEqual(['web10'])
  })

  it('maps privacy', () => {
    const record = mapFacebookPost({
      'Post text': 'Private post',
      'Post created time': '2024-01-01 00:00:00',
      'Post privacy': 'Only Me',
    })
    expect(record!.body.visibility).toBe('private')
  })

  it('maps location', () => {
    const record = mapFacebookPost({
      'Post text': 'At cafe',
      'Post created time': '2024-01-01 00:00:00',
      'Post location': 'Starbucks NYC',
    })
    const loc = record!.body.location as { name?: string }
    expect(loc?.name).toBe('Starbucks NYC')
  })

  it('returns null for empty post', () => {
    expect(mapFacebookPost({})).toBeNull()
  })
})

describe('mapFacebookPhoto', () => {
  it('maps a photo', () => {
    const record = mapFacebookPhoto({
      'Photo URL': 'https://fb.com/photo.jpg',
      'Photo created time': '2024-01-01 00:00:00',
      'Photo ID': 'photo123',
      'Photo description': 'Sunset',
      'Photo width': '1920',
      'Photo height': '1080',
    })

    expect(record).not.toBeNull()
    expect(record!.service).toBe('media')
    expect(record!.body.url).toBe('https://fb.com/photo.jpg')
    expect(record!.body.width).toBe(1920)
    expect(record!.body.height).toBe(1080)
  })

  it('returns null for empty photo', () => {
    expect(mapFacebookPhoto({})).toBeNull()
  })
})

describe('mapFacebookFriend', () => {
  it('maps a friend', () => {
    const record = mapFacebookFriend({
      'Friend name': 'Alice Smith',
      'Friend ID': 'fb123',
    })

    expect(record).not.toBeNull()
    expect(record!.service).toBe('contacts')
    expect(record!.body.username).toBe('alice_smith')
    expect(record!.body.provider).toBe('facebook')
    expect(record!.body.display_name).toBe('Alice Smith')
  })

  it('returns null for empty friend', () => {
    expect(mapFacebookFriend({})).toBeNull()
  })
})

describe('mapFacebookComment', () => {
  it('maps a comment with post ID', () => {
    const record = mapFacebookComment({
      'Comment body': 'Nice!',
      'Comment created time': '2024-01-01 01:00:00',
      'Comment post ID': 'post123',
      'Comment author name': 'Bob',
    })

    expect(record).not.toBeNull()
    expect(record!.body.post_id).toBe('post123')
    expect(record!.body.text).toBe('Nice!')
    expect(record!.body.author_username).toBe('bob')
  })

  it('returns null for empty comment', () => {
    expect(mapFacebookComment({})).toBeNull()
  })
})
