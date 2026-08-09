import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createV3Client, type V3Client } from './v3'
import * as http from './http'
import * as token from './token'

describe('v3 client', () => {
  let client: V3Client
  const mockToken = 'eyJhbGciOiJIUzI1NiJ9.test'
  const mockDecoded = { username: 'alice', provider: 'test.local', site: 'web10' }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(token, 'readTokenCookie').mockReturnValue(null)
    vi.spyOn(token, 'decodeJwt').mockReturnValue(mockDecoded as any)
    vi.spyOn(token, 'setTokenCookie').mockImplementation(() => {})
    vi.spyOn(token, 'scrubTokenCookie').mockImplementation(() => {})
    vi.spyOn(http, 'authPost').mockResolvedValue({})

    client = createV3Client({ apiOrigin: 'http://api.localhost' })
  })

  // ── Token management ──────────────────────────────────────────────────

  describe('token management', () => {
    it('starts signed out when no token', () => {
      expect(client.isSignedIn()).toBe(false)
    })

    it('setToken stores and persists token', () => {
      client.setToken(mockToken)
      expect(client.isSignedIn()).toBe(true)
      expect(token.setTokenCookie).toHaveBeenCalledWith(mockToken)
    })

    it('scrubToken clears token', () => {
      client.setToken(mockToken)
      client.scrubToken()
      expect(client.isSignedIn()).toBe(false)
      expect(token.scrubTokenCookie).toHaveBeenCalled()
    })

    it('signOut calls scrubToken', () => {
      client.setToken(mockToken)
      client.signOut()
      expect(client.isSignedIn()).toBe(false)
    })

    it('readToken decodes the current token', () => {
      client.setToken(mockToken)
      const result = client.readToken()
      expect(result).toEqual(mockDecoded)
    })

    it('state returns a copy', () => {
      client.setToken(mockToken)
      const s1 = client.state
      const s2 = client.state
      expect(s1).toEqual(s2)
      expect(s1).not.toBe(s2)
    })
  })

  // ── Auth ──────────────────────────────────────────────────────────────

  describe('auth', () => {
    it('login calls v3/login and sets token', async () => {
      const mockResponse = { token: 'new-token' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.login('alice', 'password')
      expect(result).toEqual(mockResponse)
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/login',
        expect.objectContaining({ username: 'alice', password: 'password' }),
      )
      expect(token.setTokenCookie).toHaveBeenCalledWith('new-token')
    })

    it('signup calls v3/signup', async () => {
      const mockResponse = { username: 'bob', phone: '', email: '' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.signup('bob', 'secret', '1234567890')
      expect(result).toEqual(mockResponse)
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/signup',
        expect.objectContaining({ username: 'bob', password: 'secret', phone: '1234567890' }),
      )
    })

    it('getProfile requires token', async () => {
      client.setToken(mockToken)
      const mockResponse = { username: 'alice', phone: '123' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.getProfile()
      expect(result).toEqual(mockResponse)
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/profile',
        expect.objectContaining({ token: mockToken }),
      )
    })

    it('throws when making authenticated call without token', async () => {
      await expect(client.getProfile()).rejects.toThrow('No token available')
    })

    it('verifyPhone', async () => {
      client.setToken(mockToken)
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ phone_verified: true } as any)
      const result = await client.verifyPhone('123456')
      expect(result.phone_verified).toBe(true)
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/verify-phone',
        expect.objectContaining({ code: '123456', token: mockToken }),
      )
    })

    it('verifyEmail', async () => {
      client.setToken(mockToken)
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ email_verified: true } as any)
      const result = await client.verifyEmail('654321')
      expect(result.email_verified).toBe(true)
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/verify-email',
        expect.objectContaining({ code: '654321', token: mockToken }),
      )
    })
  })

  // ── CRUD with groups ──────────────────────────────────────────────────

  describe('CRUD', () => {
    beforeEach(() => client.setToken(mockToken))

    it('create sends collection, body, and groups', async () => {
      const mockResponse = { doc_id: 'abc123', collection_name: 'notes', body: { text: 'hello' } }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.create('notes', { text: 'hello' }, { groups: ['g1', 'g2'] })
      expect(result).toEqual(mockResponse)
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/create',
        expect.objectContaining({
          token: mockToken,
          collection: 'notes',
          body: { text: 'hello' },
          groups: ['g1', 'g2'],
        }),
      )
    })

    it('create without groups', async () => {
      const mockResponse = { doc_id: 'abc123', collection_name: 'notes', body: { text: 'hello' } }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      await client.create('notes', { text: 'hello' })
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.groups).toBeUndefined()
    })

    it('read with groups (required)', async () => {
      const mockResponse = [{ doc_id: 'abc', collection_name: 'notes', body: {} }]
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.read('notes', { groups: ['me'], limit: 20 })
      expect(result).toEqual(mockResponse)
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.groups).toEqual(['me'])
      expect(call.limit).toBe(20)
    })

    it('readById calls read-by-id', async () => {
      const mockResponse = { doc_id: 'abc', collection_name: 'notes', body: {} }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      await client.readById('abc', 'notes')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/read-by-id',
        expect.objectContaining({ doc_id: 'abc', collection: 'notes', token: mockToken }),
      )
    })

    it('update sends doc_id and body', async () => {
      const mockResponse = { doc_id: 'abc', collection_name: 'notes', body: { text: 'updated' } }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      await client.update('abc', { text: 'updated' }, { groups: ['g1'] })
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.doc_id).toBe('abc')
      expect(call.body).toEqual({ text: 'updated' })
      expect(call.groups).toEqual(['g1'])
    })

    it('delete sends doc_id', async () => {
      const mockResponse = { doc_id: 'abc', status: 'deleted' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.delete('abc')
      expect(result.status).toBe('deleted')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/delete',
        expect.objectContaining({ doc_id: 'abc', token: mockToken }),
      )
    })
  })

  // ── Service contracts ─────────────────────────────────────────────────

  describe('service contracts', () => {
    beforeEach(() => client.setToken(mockToken))

    it('addServiceContract', async () => {
      const mockResponse = { service_name: 'notes', allowed_origin: 'https://app.example.com' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.addServiceContract('notes', 'https://app.example.com')
      expect(result.service_name).toBe('notes')
      expect(result.allowed_origin).toBe('https://app.example.com')
    })

    it('listServiceContracts', async () => {
      const mockResponse = [
        { service_name: 'notes', allowed_origin: 'https://app.example.com' },
        { service_name: 'posts', allowed_origin: 'https://social.example.com' },
      ]
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.listServiceContracts()
      expect(result).toHaveLength(2)
      expect(result[0].service_name).toBe('notes')
    })

    it('revokeServiceContract with origin', async () => {
      const mockResponse = { status: 'revoked' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      await client.revokeServiceContract('https://app.example.com')
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.allowed_origin).toBe('https://app.example.com')
    })

    it('revokeServiceContract without origin (all)', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ status: 'revoked' } as any)

      await client.revokeServiceContract()
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.allowed_origin).toBeUndefined()
    })
  })

  // ── Groups ────────────────────────────────────────────────────────────

  describe('groups', () => {
    beforeEach(() => client.setToken(mockToken))

    it('createGroup', async () => {
      const mockResponse = { group_id: 'test.local/groups/users/alice/my-group' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.createGroup(
        'my-group',
        'open',
        [{ name: 'owner', permissions: ['manageRoles'] }],
        [{ member_key: 'alice', role: 'owner' }],
      )
      expect(result.group_id).toContain('my-group')
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.name).toBe('my-group')
      expect(call.join_policy).toBe('open')
    })

    it('getMyGroups', async () => {
      const mockResponse = [
        { group_id: 'g1', my_role: 'owner', member_count: 5 },
        { group_id: 'g2', my_role: 'member', member_count: 100 },
      ]
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.getMyGroups()
      expect(result).toHaveLength(2)
      expect(result[0].my_role).toBe('owner')
    })

    it('joinGroup', async () => {
      const mockResponse = { group_id: 'g1', member_key: 'alice', role: 'member' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      await client.joinGroup('g1')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/join',
        expect.objectContaining({ group_id: 'g1', token: mockToken }),
      )
    })

    it('requestJoin calls same endpoint as joinGroup', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ group_id: 'g1', status: 'pending' } as any)
      await client.requestJoin('g1')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/join',
        expect.objectContaining({ group_id: 'g1', token: mockToken }),
      )
    })

    it('leaveGroup', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.leaveGroup('g1')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/leave',
        expect.objectContaining({ group_id: 'g1', token: mockToken }),
      )
    })

    it('getGroupMembers', async () => {
      const mockResponse = [
        { member_key: 'alice', role: 'owner' },
        { member_key: 'bob', role: 'member' },
      ]
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.getGroupMembers('g1')
      expect(result).toHaveLength(2)
    })

    it('addGroupMember', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.addGroupMember('g1', 'bob', 'moderator')
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.group_id).toBe('g1')
      expect(call.member_key).toBe('bob')
      expect(call.role).toBe('moderator')
    })

    it('inviteMember returns invited_key (not member_key)', async () => {
      const mockResponse = { group_id: 'g1', invited_key: 'charlie', status: 'invited' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.inviteMember('g1', 'charlie', 'member')
      expect(result.invited_key).toBe('charlie')
      expect(result.status).toBe('invited')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/invite',
        expect.objectContaining({ group_id: 'g1', member_key: 'charlie', role: 'member', token: mockToken }),
      )
    })

    it('acceptInvite', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.acceptInvite('g1')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/accept-invite',
        expect.objectContaining({ group_id: 'g1', token: mockToken }),
      )
    })
  })

  // ── Blocking ──────────────────────────────────────────────────────────

  describe('blocking', () => {
    beforeEach(() => client.setToken(mockToken))

    it('blockUser', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.blockUser('spammer')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/block',
        expect.objectContaining({ blocked_key: 'spammer', token: mockToken }),
      )
    })

    it('unblockUser', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.unblockUser('spammer')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/unblock',
        expect.objectContaining({ blocked_key: 'spammer', token: mockToken }),
      )
    })

    it('blockUserInGroup', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.blockUserInGroup('spammer', 'g1')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/block-in-group',
        expect.objectContaining({ blocked_key: 'spammer', group_id: 'g1', token: mockToken }),
      )
    })
  })

  // ── Sharing toggle ────────────────────────────────────────────────────

  describe('sharing', () => {
    beforeEach(() => client.setToken(mockToken))

    it('setSharing', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.setSharing('g1', false)
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.group_id).toBe('g1')
      expect(call.enabled).toBe(false)
    })
  })

  // ── Media ─────────────────────────────────────────────────────────────

  describe('media', () => {
    beforeEach(() => client.setToken(mockToken))

    it('confirmMediaUpload', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.confirmMediaUpload({ filename: 'photo.jpg', mime_type: 'image/jpeg' })
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.body).toEqual({ filename: 'photo.jpg', mime_type: 'image/jpeg' })
    })

    it('listMedia with pagination', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce([] as any)
      await client.listMedia({ limit: 10, offset: 20 })
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.limit).toBe(10)
      expect(call.offset).toBe(20)
    })
  })

  // ── Node stats ────────────────────────────────────────────────────────

  describe('stats', () => {
    beforeEach(() => client.setToken(mockToken))

    it('getNodeStats', async () => {
      const mockResponse = { users: 42, documents: 1000, groups: 50 }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.getNodeStats()
      expect(result.users).toBe(42)
      expect(result.documents).toBe(1000)
      expect(result.groups).toBe(50)
    })
  })

  // ── App Store ─────────────────────────────────────────────────────────

  describe('app store', () => {
    beforeEach(() => client.setToken(mockToken))

    it('registerApp', async () => {
      const mockResponse = { url: 'https://myapp.com', review_state: 'pending' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.registerApp({ url: 'https://myapp.com', name: 'My App' })
      expect(result.url).toBe('https://myapp.com')
      expect(result.review_state).toBe('pending')
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.body).toEqual({ url: 'https://myapp.com', name: 'My App' })
    })

    it('getApps', async () => {
      const mockResponse = [
        { url: 'https://myapp.com', name: 'My App', description: 'A web10 app', icon_url: '', screenshots: [], review_state: 'approved', metadata_version: 1 },
      ]
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.getApps()
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('My App')
    })

    it('rateApp', async () => {
      const mockResponse = { author: 'alice', target_app_id: 'https://myapp.com', rating: 5 }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.rateApp('https://myapp.com', 5)
      expect(result.rating).toBe(5)
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.body).toEqual({ target_app_id: 'https://myapp.com', rating: 5 })
    })

    it('rateApp rejects invalid rating', async () => {
      await expect(client.rateApp('https://myapp.com', 0)).rejects.toThrow('Rating must be between 1 and 5')
      await expect(client.rateApp('https://myapp.com', 6)).rejects.toThrow('Rating must be between 1 and 5')
    })

    it('getAppRatings', async () => {
      const mockResponse = [
        { author: 'alice', rating: 5, provider: 'test.local', created_at: '2026-01-01' },
      ]
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.getAppRatings('https://myapp.com')
      expect(result).toHaveLength(1)
      expect(result[0].rating).toBe(5)
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.body).toEqual({ target_app_id: 'https://myapp.com' })
    })
  })
})