import { describe, it, expect } from 'vitest'
import mockServices from '../mocks/mockServices'
import mockRequests from '../mocks/mockRequests'

describe('mockServices', () => {
  it('contains 5 service definitions', () => {
    expect(mockServices).toHaveLength(5)
  })

  it('has expected service names', () => {
    const names = mockServices.map((s) => s.service)
    expect(names).toContain('contacts')
    expect(names).toContain('posts')
    expect(names).toContain('identity')
    expect(names).toContain('messages')
    expect(names).toContain('notes')
  })

  it('each service has required fields', () => {
    for (const service of mockServices) {
      expect(service).toHaveProperty('service')
      expect(service).toHaveProperty('cross_origins')
      expect(service).toHaveProperty('whitelist')
      expect(service).toHaveProperty('blacklist')
      expect(Array.isArray(service.cross_origins)).toBe(true)
      expect(Array.isArray(service.whitelist)).toBe(true)
      expect(Array.isArray(service.blacklist)).toBe(true)
    }
  })

  it('posts service allows public read', () => {
    const posts = mockServices.find((s) => s.service === 'posts')
    expect(posts?.whitelist).toEqual([{ username: '.*', provider: '.*', read: true }])
    expect(posts?.blacklist).toEqual([])
  })

  it('identity service blocks specific user', () => {
    const identity = mockServices.find((s) => s.service === 'identity')
    expect(identity?.blacklist).toEqual([
      { username: 'tig57', provider: 'web10.app', read: true },
    ])
  })

  it('messages service blocks specific user from create', () => {
    const messages = mockServices.find((s) => s.service === 'messages')
    expect(messages?.blacklist).toEqual([
      { username: 'tig57', provider: 'web10.app', create: true },
    ])
  })

  it('contacts and notes have empty ACL', () => {
    const contacts = mockServices.find((s) => s.service === 'contacts')
    const notes = mockServices.find((s) => s.service === 'notes')
    expect(contacts?.whitelist).toEqual([])
    expect(contacts?.blacklist).toEqual([])
    expect(notes?.whitelist).toEqual([])
    expect(notes?.blacklist).toEqual([])
  })
})

describe('mockRequests', () => {
  it('contains 3 request definitions', () => {
    expect(mockRequests).toHaveLength(3)
  })

  it('has expected service names', () => {
    const names = mockRequests.map((r) => r.service)
    expect(names).toContain('posts')
    expect(names).toContain('messages')
    expect(names).toContain('snake')
  })

  it('each request has required fields', () => {
    for (const request of mockRequests) {
      expect(request).toHaveProperty('service')
      expect(request).toHaveProperty('cross_origins')
      expect(request).toHaveProperty('whitelist')
      expect(request).toHaveProperty('blacklist')
    }
  })

  it('snake request has empty ACL', () => {
    const snake = mockRequests.find((r) => r.service === 'snake')
    expect(snake?.whitelist).toEqual([])
    expect(snake?.blacklist).toEqual([])
  })
})
