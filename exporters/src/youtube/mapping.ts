import type { ZipEntry } from '../zip'
import type { ImportRecord } from '../types'

interface YouTubeVideo {
  id?: string
  snippet?: {
    title?: string
    description?: string
    publishedAt?: string
    channelId?: string
    thumbnails?: Record<string, { url?: string; width?: number; height?: number }>
  }
  contentDetails?: {
    duration?: string
    dimension?: string
    definition?: string
  }
  statistics?: {
    viewCount?: string
    likeCount?: string
    commentCount?: string
  }
  status?: {
    privacyStatus?: string
  }
  [key: string]: unknown
}

interface YouTubeComment {
  id?: string
  snippet?: {
    topLevelCommentId?: string
    videoId?: string
    parentId?: string
    authorDisplayName?: string
    textDisplay?: string
    publishedAt?: string
    authorChannelId?: string
  }
  [key: string]: unknown
}

interface YouTubeChannel {
  id?: string
  snippet?: {
    title?: string
    description?: string
    customUrl?: string
  }
  [key: string]: unknown
}

function safeStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined
  return String(val).trim()
}

function parseDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return undefined
  const hours = parseInt(match[1] || '0', 10)
  const mins = parseInt(match[2] || '0', 10)
  const secs = parseInt(match[3] || '0', 10)
  return hours * 3600 + mins * 60 + secs
}

function parseTags(text: string): string[] {
  if (!text) return []
  const matches = text.match(/#(\w+)/g)
  return matches ? matches.map(t => t.slice(1)) : []
}

export function mapYouTubeVideo(video: YouTubeVideo): ImportRecord[] {
  const records: ImportRecord[] = []
  const id = safeStr(video.id) || safeStr(video.snippet?.channelId)
  const title = safeStr(video.snippet?.title)
  const description = safeStr(video.snippet?.description)
  const createdAt = video.snippet?.publishedAt
  const privacy = video.status?.privacyStatus

  const visibility: 'public' | 'friends' | 'private' | undefined =
    privacy === 'public' ? 'public' : privacy === 'private' ? 'private' : privacy === 'unlisted' ? 'friends' : undefined

  const text = [title, description].filter(Boolean).join('\n\n')

  const mediaRecords: ImportRecord[] = []
  const mediaRefs: string[] = []

  const thumb = video.snippet?.thumbnails?.high || video.snippet?.thumbnails?.default
  if (thumb?.url) {
    const mediaBody: Record<string, unknown> = {
      url: thumb.url,
      created_at: createdAt,
      origin: 'youtube',
      origin_id: id ? `thumb_${id}` : undefined,
      thumbnail_url: thumb.url,
      caption: title,
      width: thumb.width,
      height: thumb.height,
    }
    mediaRecords.push({
      service: 'media',
      body: mediaBody,
      origin: 'youtube',
      originId: `thumb_${id}`,
    })
    mediaRefs.push('')
  }

  const postBody: Record<string, unknown> = {
    text,
    created_at: createdAt,
    origin: 'youtube',
    origin_id: id,
    visibility,
    tags: text ? parseTags(text) : [],
  }

  if (video.contentDetails?.duration) {
    postBody.duration_seconds = parseDuration(video.contentDetails.duration)
  }

  if (video.statistics) {
    postBody.view_count = Number(video.statistics.viewCount) || 0
    postBody.like_count = Number(video.statistics.likeCount) || 0
    postBody.comment_count = Number(video.statistics.commentCount) || 0
  }

  if (mediaRefs.length > 0) postBody.media_refs = mediaRefs

  records.push({
    service: 'posts',
    body: postBody,
    origin: 'youtube',
    originId: id,
  })

  records.push(...mediaRecords)
  return records
}

export function mapYouTubeComment(comment: YouTubeComment): ImportRecord | null {
  const text = safeStr(comment.snippet?.textDisplay)
  if (!text) return null

  const body: Record<string, unknown> = {
    text,
    created_at: comment.snippet?.publishedAt,
    origin: 'youtube',
    origin_id: safeStr(comment.snippet?.topLevelCommentId) || safeStr(comment.id),
  }

  const videoId = safeStr(comment.snippet?.videoId)
  if (videoId) body.post_id = videoId

  const parentId = safeStr(comment.snippet?.parentId)
  if (parentId) body.parent_id = parentId

  const author = safeStr(comment.snippet?.authorDisplayName)
  if (author) {
    body.author_username = author.toLowerCase().replace(/\s+/g, '_')
    body.author_provider = 'youtube'
  }

  return {
    service: 'comments',
    body,
    origin: 'youtube',
    originId: safeStr(comment.id),
  }
}

export function mapYouTubeChannel(channel: YouTubeChannel): ImportRecord | null {
  const title = safeStr(channel.snippet?.title)
  if (!title) return null

  return {
    service: 'profile',
    body: {
      display_name: title,
      bio: safeStr(channel.snippet?.description),
      website: channel.snippet?.customUrl
        ? `https://youtube.com${channel.snippet.customUrl}`
        : undefined,
      updated_at: new Date().toISOString(),
    },
    origin: 'youtube',
  }
}

export async function parseYouTubeFile(entry: ZipEntry, type: 'video' | 'comment' | 'channel'): Promise<ImportRecord[]> {
  const raw = await entry.text()
  try {
    const data = JSON.parse(raw)
    const items = data.items || data
    if (!Array.isArray(items)) return []

    const records: ImportRecord[] = []
    for (const item of items) {
      switch (type) {
        case 'video':
          records.push(...mapYouTubeVideo(item as YouTubeVideo))
          break
        case 'comment': {
          const c = mapYouTubeComment(item as YouTubeComment)
          if (c) records.push(c)
          break
        }
        case 'channel': {
          const ch = mapYouTubeChannel(item as YouTubeChannel)
          if (ch) records.push(ch)
          break
        }
      }
    }
    return records
  } catch {
    return []
  }
}

export function isYouTubeZip(entries: ZipEntry[]): boolean {
  return entries.some(e => {
    const p = e.path.toLowerCase()
    return p.includes('youtube') ||
      p.includes('takeout') && p.includes('youtube')
  })
}

export function detectYouTubeFile(entry: ZipEntry): 'video' | 'comment' | 'channel' | null {
  const p = entry.path.toLowerCase()
  if (p.includes('video') || p.includes('videos') || p.includes('upload')) return 'video'
  if (p.includes('comment')) return 'comment'
  if (p.includes('channel') || p.includes('my channels')) return 'channel'
  return null
}
