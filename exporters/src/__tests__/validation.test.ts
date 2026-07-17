import { describe, it, expect } from 'vitest'
import { createValidator, validateRecord } from '../validation'
import { postsSchema, mediaSchema, commentsSchema, contactsSchema, profileSchema } from '../schemas'

describe('schema validation', () => {
  it('validates a valid post', () => {
    const validator = createValidator(postsSchema)
    const result = validateRecord(validator, {
      text: 'Hello',
      created_at: '2024-01-01T00:00:00Z',
      origin: 'instagram',
      origin_id: '123',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects post without created_at', () => {
    const validator = createValidator(postsSchema)
    const result = validateRecord(validator, { text: 'Hello' })
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('validates a valid media record', () => {
    const validator = createValidator(mediaSchema)
    const result = validateRecord(validator, {
      url: 'https://example.com/photo.jpg',
      created_at: '2024-01-01T00:00:00Z',
      origin: 'instagram',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects media without url', () => {
    const validator = createValidator(mediaSchema)
    const result = validateRecord(validator, { created_at: '2024-01-01T00:00:00Z' })
    expect(result.valid).toBe(false)
  })

  it('validates a valid comment', () => {
    const validator = createValidator(commentsSchema)
    const result = validateRecord(validator, {
      post_id: 'post123',
      text: 'Nice post!',
      created_at: '2024-01-01T00:00:00Z',
      origin: 'instagram',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects comment without required fields', () => {
    const validator = createValidator(commentsSchema)
    const result = validateRecord(validator, { post_id: 'post123' })
    expect(result.valid).toBe(false)
  })

  it('validates a valid contact', () => {
    const validator = createValidator(contactsSchema)
    const result = validateRecord(validator, {
      username: 'alice',
      provider: 'instagram',
      display_name: 'Alice',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects contact without username', () => {
    const validator = createValidator(contactsSchema)
    const result = validateRecord(validator, { provider: 'instagram' })
    expect(result.valid).toBe(false)
  })

  it('validates a profile (no required fields)', () => {
    const validator = createValidator(profileSchema)
    const result = validateRecord(validator, {
      display_name: 'Jane',
      bio: 'Hello',
    })
    expect(result.valid).toBe(true)
  })

  it('allows additional properties', () => {
    const validator = createValidator(postsSchema)
    const result = validateRecord(validator, {
      created_at: '2024-01-01T00:00:00Z',
      custom_field: 'extra data',
      another: 42,
    })
    expect(result.valid).toBe(true)
  })
})
