import type { ZipEntry } from '../zip'
import type { ImportRecord } from '../types'

interface FacebookPost {
  'Post text'?: string
  'Post URL'?: string
  'Post ID'?: string
  'Post created time'?: string
  'Post updated time'?: string
  'Post type'?: string
  'Post likes'?: string
  'Post comments'?: string
  'Post shares'?: string
  'Post privacy'?: string
  'Post attachments'?: string
  'Post reactions'?: string
  'Post tags'?: string
  'Post location'?: string
  'Post feelings'?: string
  'Post feelings and activities'?: string
  [key: string]: unknown
}

interface FacebookPhoto {
  'Photo ID'?: string
  'Photo URL'?: string
  'Photo created time'?: string
  'Photo updated time'?: string
  'Photo description'?: string
  'Photo privacy'?: string
  'Photo album name'?: string
  'Photo album ID'?: string
  'Photo width'?: number | string
  'Photo height'?: number | string
  'Photo tags'?: string
  [key: string]: unknown
}

interface FacebookFriend {
  'Friend name'?: string
  'Friend ID'?: string
  'Friend URL'?: string
  [key: string]: unknown
}

interface FacebookComment {
  'Comment ID'?: string
  'Comment body'?: string
  'Comment created time'?: string
  'Comment URL'?: string
  'Comment post URL'?: string
  'Comment post ID'?: string
  'Comment author name'?: string
  [key: string]: unknown
}

function safeStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined
  return String(val).trim()
}

function parseTimestamp(ts: string | undefined): string | undefined {
  if (!ts) return undefined
  try {
    return new Date(ts).toISOString()
  } catch {
    return undefined
  }
}

function parseFacebookPrivacy(privacy: string | undefined): 'public' | 'friends' | 'private' | undefined {
  if (!privacy) return undefined
  const lower = privacy.toLowerCase()
  if (lower.includes('public')) return 'public'
  if (lower.includes('friend')) return 'friends'
  if (lower.includes('only me') || lower.includes('private')) return 'private'
  return undefined
}

function parseTags(text: string): string[] {
  const matches = text.match(/#(\w+)/g)
  return matches ? matches.map(t => t.slice(1)) : []
}

function parseMentions(text: string): Array<{ username: string; provider: string }> {
  if (!text) return []
  const matches = text.match(/@(\w+)/g)
  return matches
    ? matches.map(m => ({ username: m.slice(1), provider: 'facebook' }))
    : []
}

function parseJsonField(val: string | undefined): unknown[] {
  if (!val) return []
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function mapFacebookPost(post: FacebookPost): ImportRecord | null {
  const text = safeStr(post['Post text'])
  const createdAt = parseTimestamp(post['Post created time'])
  if (!createdAt && !text) return null

  const body: Record<string, unknown> = {
    text,
    created_at: createdAt,
    updated_at: parseTimestamp(post['Post updated time']),
    origin: 'facebook',
    origin_id: safeStr(post['Post ID']) || safeStr(post['Post URL']),
    visibility: parseFacebookPrivacy(post['Post privacy']),
    tags: text ? parseTags(text) : [],
    mentions: text ? parseMentions(text) : [],
  }

  const location = safeStr(post['Post location'])
  if (location) {
    body.location = { name: location }
  }

  const attachments = parseJsonField(post['Post attachments'])
  if (attachments.length > 0) {
    body.media_refs = attachments.map((a: unknown) => {
      if (typeof a === 'object' && a != null && 'url' in a) {
        return String(a.url)
      }
      return ''
    })
  }

  return {
    service: 'posts',
    body,
    origin: 'facebook',
    originId: safeStr(post['Post ID']),
  }
}

export function mapFacebookPhoto(photo: FacebookPhoto): ImportRecord | null {
  const url = safeStr(photo['Photo URL'])
  const createdAt = parseTimestamp(photo['Photo created time'])
  if (!url && !createdAt) return null

  const body: Record<string, unknown> = {
    url: url || '',
    created_at: createdAt,
    origin: 'facebook',
    origin_id: safeStr(photo['Photo ID']),
    caption: safeStr(photo['Photo description']),
    visibility: parseFacebookPrivacy(photo['Photo privacy']),
  }

  const w = Number(photo['Photo width'])
  const h = Number(photo['Photo height'])
  if (Number.isFinite(w) && w > 0) body.width = w
  if (Number.isFinite(h) && h > 0) body.height = h

  return {
    service: 'media',
    body,
    origin: 'facebook',
    originId: safeStr(photo['Photo ID']),
  }
}

export function mapFacebookFriend(friend: FacebookFriend): ImportRecord | null {
  const name = safeStr(friend['Friend name'])
  if (!name) return null

  return {
    service: 'contacts',
    body: {
      username: name.toLowerCase().replace(/\s+/g, '_'),
      provider: 'facebook',
      display_name: name,
      added_at: new Date().toISOString(),
    },
    origin: 'facebook',
    originId: safeStr(friend['Friend ID']),
  }
}

export function mapFacebookComment(comment: FacebookComment): ImportRecord | null {
  const text = safeStr(comment['Comment body'])
  const createdAt = parseTimestamp(comment['Comment created time'])
  if (!text) return null

  const body: Record<string, unknown> = {
    text,
    created_at: createdAt,
    origin: 'facebook',
    origin_id: safeStr(comment['Comment ID']),
  }

  const postId = safeStr(comment['Comment post ID'])
  if (postId) {
    body.post_id = postId
  } else if (comment['Comment post URL']) {
    const urlMatch = String(comment['Comment post URL']).match(/\/posts\/(\d+)/)
    if (urlMatch) body.post_id = urlMatch[1]
  }

  const author = safeStr(comment['Comment author name'])
  if (author) {
    body.author_username = author.toLowerCase().replace(/\s+/g, '_')
    body.author_provider = 'facebook'
  }

  return {
    service: 'comments',
    body,
    origin: 'facebook',
    originId: safeStr(comment['Comment ID']),
  }
}

export async function parseFacebookFile(entry: ZipEntry, type: 'post' | 'photo' | 'friend' | 'comment'): Promise<ImportRecord[]> {
  const raw = await entry.text()
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []

    return data
      .map(item => {
        switch (type) {
          case 'post': return mapFacebookPost(item as FacebookPost)
          case 'photo': return mapFacebookPhoto(item as FacebookPhoto)
          case 'friend': return mapFacebookFriend(item as FacebookFriend)
          case 'comment': return mapFacebookComment(item as FacebookComment)
        }
      })
      .filter((r): r is ImportRecord => r !== null)
  } catch {
    return []
  }
}

export function isFacebookZip(entries: ZipEntry[]): boolean {
  return entries.some(e => {
    const p = e.path.toLowerCase()
    return p.includes('facebook') ||
      (p.includes('your posts.json') && !p.includes('instagram')) ||
      (p.includes('your friends list.json')) ||
      (p.includes('your photos.json') && !p.includes('instagram'))
  })
}

export function detectFacebookFile(entry: ZipEntry): 'post' | 'photo' | 'friend' | 'comment' | null {
  const p = entry.path.toLowerCase()
  if (p.includes('your posts.json') || p.includes('posts/your posts.json')) return 'post'
  if (p.includes('your photos.json') || p.includes('photos/your photos.json')) return 'photo'
  if (p.includes('your friends list.json') || p.includes('friends/your friends list.json')) return 'friend'
  if (p.includes('your comments.json') || p.includes('comments/your comments.json')) return 'comment'
  return null
}
