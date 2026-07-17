// Inline schemas for browser use — mirrors docs/schemas/ without needing
// a build step to bundle JSON files. Kept in sync with the conventions doc.

const baseOrigin = {
  type: 'string',
  enum: ['web10', 'instagram', 'facebook', 'youtube', 'twitter', 'tiktok', 'other'],
} as const

export const postsSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['created_at'],
  properties: {
    text: { type: 'string', maxLength: 10000 },
    media_refs: { type: 'array', items: { type: 'string' } },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    origin: baseOrigin,
    origin_id: { type: 'string' },
    visibility: { type: 'string', enum: ['public', 'friends', 'private'], default: 'public' },
    location: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        lat: { type: 'number' },
        lon: { type: 'number' },
      },
      additionalProperties: false,
    },
    tags: { type: 'array', items: { type: 'string' } },
    mentions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['username', 'provider'],
        properties: {
          username: { type: 'string' },
          provider: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    encrypted: { type: 'boolean', default: false },
  },
  additionalProperties: true,
} as const

export const mediaSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['url', 'created_at'],
  properties: {
    url: { type: 'string', format: 'uri' },
    created_at: { type: 'string', format: 'date-time' },
    mime_type: { type: 'string' },
    size_bytes: { type: 'integer', minimum: 0 },
    width: { type: 'integer', minimum: 1 },
    height: { type: 'integer', minimum: 1 },
    duration_seconds: { type: 'number' },
    thumbnail_url: { type: 'string', format: 'uri' },
    hls_manifest_url: { type: 'string', format: 'uri' },
    caption: { type: 'string' },
    alt_text: { type: 'string' },
    origin: baseOrigin,
    origin_id: { type: 'string' },
    encrypted: { type: 'boolean', default: false },
  },
  additionalProperties: true,
} as const

export const commentsSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['post_id', 'text', 'created_at'],
  properties: {
    post_id: { type: 'string' },
    text: { type: 'string', maxLength: 10000 },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    parent_id: { type: 'string' },
    author_username: { type: 'string' },
    author_provider: { type: 'string' },
    origin: baseOrigin,
    origin_id: { type: 'string' },
  },
  additionalProperties: true,
} as const

export const contactsSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['username', 'provider'],
  properties: {
    username: { type: 'string' },
    provider: { type: 'string' },
    display_name: { type: 'string' },
    labels: { type: 'array', items: { type: 'string' } },
    added_at: { type: 'string', format: 'date-time' },
    note: { type: 'string' },
  },
  additionalProperties: true,
} as const

export const reactionsSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['target_service', 'target_id', 'type', 'created_at'],
  properties: {
    target_service: { type: 'string', enum: ['posts', 'comments'] },
    target_id: { type: 'string' },
    type: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    author_username: { type: 'string' },
    author_provider: { type: 'string' },
  },
  additionalProperties: true,
} as const

export const profileSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    display_name: { type: 'string' },
    avatar_ref: { type: 'string' },
    bio: { type: 'string', maxLength: 500 },
    website: { type: 'string', format: 'uri' },
    location: { type: 'string' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  additionalProperties: true,
} as const

export const followsSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['username', 'provider', 'status'],
  properties: {
    username: { type: 'string' },
    provider: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'active', 'rejected', 'blocked'] },
    followed_at: { type: 'string', format: 'date-time' },
    notify: { type: 'boolean', default: true },
  },
  additionalProperties: true,
} as const

export const inboxSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['author_username', 'author_provider', 'post_id', 'delivered_at'],
  properties: {
    author_username: { type: 'string' },
    author_provider: { type: 'string' },
    post_id: { type: 'string' },
    delivered_at: { type: 'string', format: 'date-time' },
    post_body: { type: 'object' },
    read: { type: 'boolean', default: false },
    score: { type: 'number' },
    origin: baseOrigin,
  },
  additionalProperties: true,
} as const
