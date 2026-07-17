import type { ZipEntry } from '../zip'
import type { ImportRecord } from '../types'

interface InstagramPost {
  post_id?: string
  post_text?: string
  post_timestamp?: string
  post_like_count?: number
  post_comment_count?: number
  post_view_count?: number
  post_play_count?: number
  post_type?: string
  post_location?: string
  post_latitude?: number | string
  post_longitude?: number | string
  post_is_pinned?: string
  post_is_paid_partnership?: string
  post_product_type?: string
  tagged_users?: string
  media?: InstagramMedia[]
  comments?: InstagramComment[]
  [key: string]: unknown
}

interface InstagramMedia {
  media_id?: string
  media_alt_text?: string
  media_duration?: number | string
  media_filename?: string
  media_product_type?: string
  media_timestamp?: string
  media_type?: string
  media_width?: number | string
  media_height?: number | string
  [key: string]: unknown
}

interface InstagramComment {
  comment_id?: string
  comment_body?: string
  comment_timestamp?: string
  comment_owner_username?: string
  comment_like_count?: number
  child_comments?: InstagramComment[]
  [key: string]: unknown
}

interface InstagramProfile {
  biography?: string
  biography_with_entities?: string
  external_url?: string
  full_name?: string
  username?: string
  pk?: string
  [key: string]: unknown
}

interface InstagramRelationship {
  user_id?: string
  username?: string
  full_name?: string
  is_private?: string
  is_verified?: string
  profile_pic_url?: string
  [key: string]: unknown
}

function safeNum(val: unknown): number | undefined {
  if (val == null || val === '') return undefined
  const n = Number(val)
  return Number.isFinite(n) ? n : undefined
}

function safeStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined
  return String(val).trim()
}

function parseTags(text: string): string[] {
  const matches = text.match(/#(\w+)/g)
  return matches ? matches.map(t => t.slice(1)) : []
}

function parseMentions(text: string): Array<{ username: string; provider: string }> {
  const matches = text.match(/@(\w+)/g)
  return matches
    ? matches.map(m => ({ username: m.slice(1), provider: 'instagram' }))
    : []
}

function parseTaggedUsers(taggedJson: string | undefined): Array<{ username: string; provider: string }> {
  if (!taggedJson) return []
  try {
    const parsed = JSON.parse(taggedJson)
    if (Array.isArray(parsed)) {
      return parsed
        .filter((u: unknown) => typeof u === 'object' && u != null && 'username' in u)
        .map((u: Record<string, unknown>) => ({
          username: String(u.username),
          provider: 'instagram',
        }))
    }
  } catch {
    // malformed JSON, skip
  }
  return []
}

function parseTimestamp(ts: string | undefined): string | undefined {
  if (!ts) return undefined
  try {
    return new Date(ts).toISOString()
  } catch {
    return undefined
  }
}

export function mapInstagramPost(post: InstagramPost): ImportRecord[] {
  const records: ImportRecord[] = []
  const createdAt = parseTimestamp(post.post_timestamp)
  const text = safeStr(post.post_text)
  const media = Array.isArray(post.media) ? post.media : []
  const taggedUsers = parseTaggedUsers(post.tagged_users)

  const mentions = text ? [...new Set([...parseMentions(text), ...taggedUsers].map(m => JSON.stringify(m)))].map(m => JSON.parse(m)) : taggedUsers

  const location: { name?: string; lat?: number; lon?: number } = {}
  if (post.post_location) location.name = safeStr(post.post_location)
  const lat = safeNum(post.post_latitude)
  const lon = safeNum(post.post_longitude)
  if (lat != null) location.lat = lat
  if (lon != null) location.lon = lon

  const mediaRefs: string[] = []
  const mediaRecords: ImportRecord[] = []

  for (const m of media) {
    const mediaRecord: Record<string, unknown> = {
      url: m.media_filename || '',
      created_at: parseTimestamp(m.media_timestamp) || createdAt,
      origin: 'instagram',
      origin_id: m.media_id,
      caption: safeStr(m.media_alt_text),
      alt_text: safeStr(m.media_alt_text),
    }
    const w = safeNum(m.media_width)
    const h = safeNum(m.media_height)
    if (w != null) mediaRecord.width = w
    if (h != null) mediaRecord.height = h
    const dur = safeNum(m.media_duration)
    if (dur != null) mediaRecord.duration_seconds = dur

    mediaRecords.push({
      service: 'media',
      body: mediaRecord,
      origin: 'instagram',
      originId: m.media_id,
    })

    // Placeholder ID — will be replaced after writing
    mediaRefs.push('')
  }

  const tags = text ? parseTags(text) : []

  const visibility = post.post_is_pinned === 'true' ? 'public' : 'public'

  const postRecord: Record<string, unknown> = {
    text,
    created_at: createdAt,
    origin: 'instagram',
    origin_id: post.post_id,
    visibility,
    tags,
    mentions,
  }
  if (media.length > 0) postRecord.media_refs = mediaRefs
  if (Object.keys(location).length > 0) postRecord.location = location

  records.push({
    service: 'posts',
    body: postRecord,
    origin: 'instagram',
    originId: post.post_id,
  })

  records.push(...mediaRecords)

  const comments = Array.isArray(post.comments) ? post.comments : []
  for (const c of comments) {
    const commentRecord = mapInstagramComment(c, post.post_id)
    if (commentRecord) records.push(commentRecord)
    if (Array.isArray(c.child_comments)) {
      for (const child of c.child_comments) {
        const childRecord = mapInstagramComment(child, post.post_id, c.comment_id)
        if (childRecord) records.push(childRecord)
      }
    }
  }

  return records
}

function mapInstagramComment(
  comment: InstagramComment,
  postId: string | undefined,
  parentId?: string
): ImportRecord | null {
  if (!postId) return null
  const text = safeStr(comment.comment_body)
  if (!text) return null

  const body: Record<string, unknown> = {
    post_id: postId,
    text,
    created_at: parseTimestamp(comment.comment_timestamp),
    origin: 'instagram',
    origin_id: comment.comment_id,
  }
  if (parentId) body.parent_id = parentId
  if (comment.comment_owner_username) {
    body.author_username = comment.comment_owner_username
    body.author_provider = 'instagram'
  }

  return {
    service: 'comments',
    body,
    origin: 'instagram',
    originId: comment.comment_id,
  }
}

export function mapInstagramProfile(profile: InstagramProfile): ImportRecord {
  const body: Record<string, unknown> = {
    display_name: safeStr(profile.full_name),
    bio: safeStr(profile.biography),
    website: safeStr(profile.external_url),
    updated_at: new Date().toISOString(),
  }

  return {
    service: 'profile',
    body,
    origin: 'instagram',
  }
}

export function mapInstagramFollows(relations: InstagramRelationship[]): ImportRecord[] {
  return relations
    .filter(r => r.username)
    .map(r => ({
      service: 'contacts',
      body: {
        username: r.username,
        provider: 'instagram',
        display_name: safeStr(r.full_name),
        added_at: new Date().toISOString(),
      } as Record<string, unknown>,
      origin: 'instagram',
      originId: r.user_id,
    }))
}

export async function parseInstagramPostFile(entry: ZipEntry): Promise<ImportRecord[]> {
  const raw = await entry.text()
  try {
    const data: InstagramPost = JSON.parse(raw)
    return mapInstagramPost(data)
  } catch {
    return []
  }
}

export async function parseInstagramProfile(entries: ZipEntry[]): Promise<ImportRecord | null> {
  const indexEntry = entries.find(e =>
    e.path.includes('index.json') || e.path.includes('your Instagram information.json')
  )
  if (!indexEntry) return null

  const raw = await indexEntry.text()
  try {
    const data: InstagramProfile = JSON.parse(raw)
    return mapInstagramProfile(data)
  } catch {
    return null
  }
}

export async function parseInstagramFollows(entries: ZipEntry[]): Promise<ImportRecord[]> {
  const listEntry = entries.find(e =>
    e.path.includes('list.json') && e.path.includes('relationships')
  )
  if (!listEntry) return []

  const raw = await listEntry.text()
  try {
    const data: InstagramRelationship[] = JSON.parse(raw)
    if (Array.isArray(data)) {
      return mapInstagramFollows(data)
    }
    return []
  } catch {
    return []
  }
}

export function isInstagramZip(entries: ZipEntry[]): boolean {
  return entries.some(e =>
    e.path.includes('instagram') ||
    e.path.includes('posts/') && e.path.endsWith('.json') ||
    e.path.includes('Your Instagram and basic information')
  )
}
