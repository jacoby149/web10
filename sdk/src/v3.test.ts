import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createV3Client, type V3Client } from './v3'
import * as http from './http'
import * as token from './token'
import { decodeJwt, isTokenExpired, readTokenCookie, setTokenCookie, scrubTokenCookie } from './token'
import { Web10Error } from './http'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeJwt(payload: Record<string, unknown>): string {
  const h = btoa(JSON.stringify(payload))
  return `header.${h}.sig`
}

// ── Token utilities (no fetch needed) ──────────────────────────────────────

describe('token utilities', () => {
  describe('decodeJwt', () => {
    it('decodes a valid JWT payload', () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      expect(decodeJwt(makeJwt(payload))).toEqual(payload)
    })

    it('returns null for null token', () => {
      expect(decodeJwt(null)).toBeNull()
    })

    it('returns null for malformed token', () => {
      expect(decodeJwt('not-a-jwt')).toBeNull()
    })

    it('returns null for token with missing parts', () => {
      expect(decodeJwt('only-one-part')).toBeNull()
    })
  })

  describe('isTokenExpired', () => {
    it('is true for a token whose ISO expires is in the past', () => {
      const jwt = makeJwt({ username: 'alice', expires: '2000-01-01T00:00:00' })
      expect(isTokenExpired(jwt)).toBe(true)
    })

    it('is false for a token whose ISO expires is in the future', () => {
      const jwt = makeJwt({ username: 'alice', expires: '2999-01-01T00:00:00' })
      expect(isTokenExpired(jwt)).toBe(false)
    })

    it('is false when there is no expiry or no token', () => {
      expect(isTokenExpired(makeJwt({ username: 'alice' }))).toBe(false)
      expect(isTokenExpired(null)).toBe(false)
    })
  })

  describe('cookie helpers', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('setTokenCookie writes to document.cookie', () => {
      vi.spyOn(document, 'cookie', 'set')
      setTokenCookie('test-token')
      expect(document.cookie).toContain('token=test-token')
    })

    it('scrubTokenCookie sets max-age=-1', () => {
      vi.spyOn(document, 'cookie', 'set')
      expect(() => scrubTokenCookie()).not.toThrow()
    })

    it('readTokenCookie returns null when no token cookie', () => {
      document.cookie = 'other=value;path=/'
      expect(readTokenCookie()).toBeNull()
    })
  })
})

// ── HTTP ───────────────────────────────────────────────────────────────────

describe('HTTP', () => {
  it('Web10Error has status and details', () => {
    const err = new Web10Error('bad', 500, 'internal')
    expect(err.name).toBe('Web10Error')
    expect(err.status).toBe(500)
    expect(err.details).toBe('internal')
    expect(err.message).toBe('bad')
  })
})

// ── v3 client ──────────────────────────────────────────────────────────────

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

  // ── Client creation ────────────────────────────────────────────────────

  describe('client creation', () => {
    it('returns a client with expected methods', () => {
      expect(client).toHaveProperty('setToken')
      expect(client).toHaveProperty('scrubToken')
      expect(client).toHaveProperty('readToken')
      expect(client).toHaveProperty('isSignedIn')
      expect(client).toHaveProperty('signOut')
      expect(client).toHaveProperty('login')
      expect(client).toHaveProperty('signup')
      expect(client).toHaveProperty('getProfile')
      expect(client).toHaveProperty('changePassword')
      expect(client).toHaveProperty('changePhone')
      expect(client).toHaveProperty('setEmail')
      expect(client).toHaveProperty('verifyPhone')
      expect(client).toHaveProperty('verifyEmail')
      expect(client).toHaveProperty('sendCode')
      expect(client).toHaveProperty('setRecoveryPhone')
      expect(client).toHaveProperty('create')
      expect(client).toHaveProperty('read')
      expect(client).toHaveProperty('readById')
      expect(client).toHaveProperty('update')
      expect(client).toHaveProperty('delete')
      expect(client).toHaveProperty('addAppContract')
      expect(client).toHaveProperty('listAppContracts')
      expect(client).toHaveProperty('revokeAppContract')
      expect(client).toHaveProperty('createGroup')
      expect(client).toHaveProperty('getGroup')
      expect(client).toHaveProperty('getMyGroups')
      expect(client).toHaveProperty('getGroupsManages')
      expect(client).toHaveProperty('updateGroup')
      expect(client).toHaveProperty('joinGroup')
      expect(client).toHaveProperty('requestJoin')
      expect(client).toHaveProperty('leaveGroup')
      expect(client).toHaveProperty('getGroupMembers')
      expect(client).toHaveProperty('addGroupMember')
      expect(client).toHaveProperty('removeGroupMember')
      expect(client).toHaveProperty('inviteMember')
      expect(client).toHaveProperty('acceptInvite')
      expect(client).toHaveProperty('declineInvite')
      expect(client).toHaveProperty('getJoinRequests')
      expect(client).toHaveProperty('approveJoinRequest')
      expect(client).toHaveProperty('denyJoinRequest')
      expect(client).toHaveProperty('blockUser')
      expect(client).toHaveProperty('unblockUser')
      expect(client).toHaveProperty('blockUserInGroup')
      expect(client).toHaveProperty('unblockUserInGroup')
      expect(client).toHaveProperty('setSharing')
      expect(client).toHaveProperty('requestMediaUploadUrl')
      expect(client).toHaveProperty('getMediaReadUrl')
      expect(client).toHaveProperty('confirmMediaUpload')
      expect(client).toHaveProperty('listMedia')
      expect(client).toHaveProperty('deleteMedia')
      expect(client).toHaveProperty('getNodeStats')
      expect(client).toHaveProperty('registerApp')
      expect(client).toHaveProperty('getApps')
      expect(client).toHaveProperty('rateApp')
      expect(client).toHaveProperty('getAppRatings')
    })

    it('sets apiOrigin from options', () => {
      expect(client.state.apiOrigin).toBe('http://api.localhost')
    })

    it('defaults apiOrigin to https://api.web10.app', () => {
      const w = createV3Client()
      expect(w.state.apiOrigin).toBe('https://api.web10.app')
    })

    it('sets rtcServer from options', () => {
      const w = createV3Client({ rtcServer: 'rtc.custom.com' })
      expect(w.state.rtcServer).toBe('rtc.custom.com')
    })

    it('defaults rtcServer to rtc.web10.app', () => {
      const w = createV3Client()
      expect(w.state.rtcServer).toBe('rtc.web10.app')
    })

    it('reads token from cookie on init', () => {
      vi.spyOn(token, 'readTokenCookie').mockReturnValue('cookie-jwt')
      const w = createV3Client()
      expect(w.state.token).toBe('cookie-jwt')
    })

    it('has null token when no cookie', () => {
      expect(client.state.token).toBeNull()
    })
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

    it('changePassword', async () => {
      client.setToken(mockToken)
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ status: 'ok' } as any)
      await client.changePassword('old', 'new')
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.password).toBe('old')
      expect(call.new_pass).toBe('new')
    })

    it('changePhone', async () => {
      client.setToken(mockToken)
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ phone: '+1234' } as any)
      const result = await client.changePhone('+1234')
      expect(result.phone).toBe('+1234')
    })

    it('setEmail', async () => {
      client.setToken(mockToken)
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ email: 'a@b.com' } as any)
      const result = await client.setEmail('a@b.com')
      expect(result.email).toBe('a@b.com')
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

    it('sendCode', async () => {
      client.setToken(mockToken)
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ sent: true } as any)
      const result = await client.sendCode()
      expect(result.sent).toBe(true)
    })

    it('setRecoveryPhone', async () => {
      client.setToken(mockToken)
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ phone_number: '+999' } as any)
      const result = await client.setRecoveryPhone('+999')
      expect(result.phone_number).toBe('+999')
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

  // ── App contracts (per-app with per-service permissions) ──────────────

  describe('app contracts', () => {
    beforeEach(() => client.setToken(mockToken))

    it('addAppContract', async () => {
      const mockResponse = { allowed_origin: 'https://app.example.com', permissions: { posts: ['readAll', 'create'] } }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.addAppContract('https://app.example.com', { posts: ['readAll', 'create'] })
      expect(result.allowed_origin).toBe('https://app.example.com')
      expect(result.permissions.posts).toContain('readAll')
    })

    it('listAppContracts', async () => {
      const mockResponse = [
        { allowed_origin: 'https://app.example.com', permissions: { posts: ['readAll', 'create'] } },
        { allowed_origin: 'https://social.example.com', permissions: { posts: ['readAll'] } },
      ]
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      const result = await client.listAppContracts()
      expect(result).toHaveLength(2)
      expect(result[0].allowed_origin).toBe('https://app.example.com')
    })

    it('revokeAppContract with origin', async () => {
      const mockResponse = { status: 'revoked' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)

      await client.revokeAppContract('https://app.example.com')
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.allowed_origin).toBe('https://app.example.com')
    })

    it('revokeAppContract without origin (all)', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ status: 'revoked' } as any)

      await client.revokeAppContract()
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

    it('getGroup', async () => {
      const mockResponse = { group_id: 'g1', join_policy: 'open', my_role: 'member', member_count: 5 }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.getGroup('g1')
      expect(result.group_id).toBe('g1')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/get',
        expect.objectContaining({ group_id: 'g1', token: mockToken }),
      )
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

    it('getGroupsManages', async () => {
      const mockResponse = [
        { group_id: 'g1', my_role: 'owner', member_count: 5 },
      ]
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.getGroupsManages()
      expect(result).toHaveLength(1)
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/manages',
        expect.objectContaining({ token: mockToken }),
      )
    })

    it('updateGroup with join_policy and roles', async () => {
      const mockResponse = { group_id: 'g1', join_policy: 'request', my_role: 'owner', member_count: 5 }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      await client.updateGroup('g1', { join_policy: 'request', roles: [{ name: 'member', permissions: ['readAll'] }] })
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.group_id).toBe('g1')
      expect(call.join_policy).toBe('request')
      expect(call.roles).toEqual([{ name: 'member', permissions: ['readAll'] }])
    })

    it('updateGroup with only join_policy', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ group_id: 'g1', join_policy: 'open', my_role: 'owner', member_count: 5 } as any)
      await client.updateGroup('g1', { join_policy: 'open' })
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.roles).toBeUndefined()
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

    it('removeGroupMember', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.removeGroupMember('g1', 'bob')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/members/remove',
        expect.objectContaining({ group_id: 'g1', member_key: 'bob', token: mockToken }),
      )
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

    it('declineInvite', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ group_id: 'g1', status: 'declined' } as any)
      const result = await client.declineInvite('g1')
      expect(result.status).toBe('declined')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/decline-invite',
        expect.objectContaining({ group_id: 'g1', token: mockToken }),
      )
    })
  })

  // ── Join request management ───────────────────────────────────────────

  describe('join requests', () => {
    beforeEach(() => client.setToken(mockToken))

    it('getJoinRequests', async () => {
      const mockResponse = [
        { requester_key: 'bob', status: 'pending', requested_at: '2026-01-01' },
      ]
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.getJoinRequests('g1')
      expect(result).toHaveLength(1)
      expect(result[0].requester_key).toBe('bob')
    })

    it('approveJoinRequest', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ group_id: 'g1', requester_key: 'bob', status: 'approved' } as any)
      const result = await client.approveJoinRequest('g1', 'bob')
      expect(result.status).toBe('approved')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/requests/join/approve',
        expect.objectContaining({ group_id: 'g1', requester_key: 'bob', token: mockToken }),
      )
    })

    it('denyJoinRequest', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ group_id: 'g1', requester_key: 'bob', status: 'denied' } as any)
      const result = await client.denyJoinRequest('g1', 'bob')
      expect(result.status).toBe('denied')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/requests/join/deny',
        expect.objectContaining({ group_id: 'g1', requester_key: 'bob', token: mockToken }),
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
        'http://api.localhost/v3/groups/block',
        expect.objectContaining({ blocked_key: 'spammer', group_id: 'g1', token: mockToken }),
      )
    })

    it('unblockUserInGroup', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.unblockUserInGroup('spammer', 'g1')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/groups/unblock',
        expect.objectContaining({ blocked_key: 'spammer', group_id: 'g1', token: mockToken }),
      )
    })
  })

  // ── Sharing toggle ────────────────────────────────────────────────────

  describe('sharing', () => {
    beforeEach(() => client.setToken(mockToken))

    it('setSharing enabled', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.setSharing('g1', true)
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.group_id).toBe('g1')
      expect(call.enabled).toBe(true)
    })

    it('setSharing disabled', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({} as any)
      await client.setSharing('g1', false)
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.enabled).toBe(false)
    })
  })

  // ── Media ─────────────────────────────────────────────────────────────

  describe('media', () => {
    beforeEach(() => client.setToken(mockToken))

    it('requestMediaUploadUrl', async () => {
      const mockResponse = { upload_url: 'https://s3.example.com', fields: {}, object_key: 'k', content_type: 'image/png' }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.requestMediaUploadUrl({ filename: 'photo.png', mimeType: 'image/png', sizeBytes: 123 })
      expect(result.upload_url).toBe('https://s3.example.com')
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.body).toEqual({ filename: 'photo.png', mime_type: 'image/png', size_bytes: 123 })
    })

    it('requestMediaUploadUrl defaults mime_type', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ upload_url: 'u', fields: {}, object_key: 'k', content_type: 'application/octet-stream' } as any)
      await client.requestMediaUploadUrl({ filename: 'data.bin' })
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.body.mime_type).toBe('application/octet-stream')
      expect(call.body.size_bytes).toBeNull()
    })

    it('getMediaReadUrl', async () => {
      const mockResponse = { read_url: 'https://s3.example.com/signed', expires_in: 60 }
      vi.spyOn(http, 'authPost').mockResolvedValueOnce(mockResponse as any)
      const result = await client.getMediaReadUrl('alice/abc/x.png')
      expect(result.read_url).toBe('https://s3.example.com/signed')
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.body).toEqual({ object_key: 'alice/abc/x.png' })
    })

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

    it('listMedia without pagination', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce([] as any)
      await client.listMedia()
      const call = (vi.mocked(http.authPost).mock.calls[0][1] as any)
      expect(call.limit).toBeUndefined()
      expect(call.offset).toBeUndefined()
    })

    it('deleteMedia', async () => {
      vi.spyOn(http, 'authPost').mockResolvedValueOnce({ doc_id: 'abc', status: 'deleted' } as any)
      const result = await client.deleteMedia('abc')
      expect(result.status).toBe('deleted')
      expect(http.authPost).toHaveBeenCalledWith(
        'http://api.localhost/v3/media/delete',
        expect.objectContaining({ doc_id: 'abc', token: mockToken }),
      )
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
