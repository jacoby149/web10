import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createV3Client } from './v3'
import { Web10Error } from './http'
import { scrubTokenCookie, setTokenCookie } from './token'

const origin = 'https://api.example'
const groupId = 'api.example/groups/alice/jazz'
const detail = { group_id: groupId, is_member: true, posts_state: 'ok', posts: [] }
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  scrubTokenCookie()
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => detail })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { scrubTokenCookie(); vi.unstubAllGlobals() })

describe('group-detail credential transport', () => {
  it('puts the session in the POST body, never the URL, and inherits redirect/cookie protection', async () => {
    const client = createV3Client({ apiOrigin: origin, token: 'session-secret' })
    fetchMock.mockClear()
    expect(await client.getGroupDetail(groupId)).toEqual(detail)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${origin}/v3/groups/detail`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, token: 'session-secret' }),
      credentials: 'omit', redirect: 'error',
    })
  })

  it('supports anonymous POST without a credential', async () => {
    const client = createV3Client({ apiOrigin: origin })
    fetchMock.mockClear()
    await client.getGroupDetail(groupId)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ group_id: groupId })
  })

  it('uses the cookie fallback when the session arrived after client initialization', async () => {
    const client = createV3Client({ apiOrigin: origin })
    setTokenCookie('new-session-secret')
    fetchMock.mockClear()
    await client.getGroupDetail(groupId)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ group_id: groupId, token: 'new-session-secret' })
  })

  it('never interpolates the group ID into the request URL', async () => {
    const client = createV3Client({ apiOrigin: origin })
    fetchMock.mockClear()
    await client.getGroupDetail(`${groupId}?token=not-a-credential&fragment=#value`)
    expect(fetchMock.mock.calls[0][0]).toBe(`${origin}/v3/groups/detail`)
  })

  it.each([401, 404])('preserves SDK status %s without downgrading invalid credentials', async (status) => {
    const client = createV3Client({ apiOrigin: origin, token: 'invalid-session' })
    fetchMock.mockClear()
    fetchMock.mockResolvedValue({ ok: false, status, statusText: 'Denied', text: async () => '{"detail":"access denied"}' })
    await expect(client.getGroupDetail(groupId)).rejects.toMatchObject({
      name: 'Web10Error', status, message: 'access denied',
    } satisfies Partial<Web10Error>)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
