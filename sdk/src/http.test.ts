import { describe, it, expect, vi, afterEach } from 'vitest'
import { authPost, Web10Error } from './http'

/** Build a Response-like object for a non-2xx API reply. */
function badResponse(status: number, statusText: string, body: string) {
  return {
    ok: false,
    status,
    statusText,
    text: async () => body,
  }
}

describe('authPost error surfacing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces a FastAPI string detail as the message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        badResponse(403, 'Forbidden', '{"detail":"No app contract for https://social.dev.web10.app to create on web10-social-group-identity"}'),
      ),
    )
    await expect(authPost('http://api/v3/documents', {})).rejects.toThrow(
      'No app contract for https://social.dev.web10.app to create on web10-social-group-identity',
    )
  })

  it('keeps the status + the raw body on the error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        badResponse(403, 'Forbidden', '{"detail":"not a member of the requested group"}'),
      ),
    )
    try {
      await authPost('http://api/v3/documents', {})
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(Web10Error)
      const err = e as Web10Error
      expect(err.status).toBe(403)
      expect(err.message).toBe('not a member of the requested group')
      expect(err.details).toBe('{"detail":"not a member of the requested group"}')
    }
  })

  it('401 invalid credentials carries the real reason, not just the code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        badResponse(401, 'Unauthorized', '{"detail":"invalid credentials"}'),
      ),
    )
    await expect(authPost('http://api/v3/login', {})).rejects.toThrow('invalid credentials')
  })

  it('falls back to the status line when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(badResponse(502, 'Bad Gateway', '<html>Bad Gateway</html>')),
    )
    await expect(authPost('http://api/v3/documents', {})).rejects.toThrow(
      'Request failed: 502 Bad Gateway',
    )
  })

  it('falls back to the status line on an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badResponse(500, 'Internal Server Error', '')))
    await expect(authPost('http://api/v3/documents', {})).rejects.toThrow(
      'Request failed: 500 Internal Server Error',
    )
  })

  it('folds a 422 validation-error array into one line', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        badResponse(422, 'Unprocessable Entity', '{"detail":[{"loc":["body","username"],"msg":"field required"}]}'),
      ),
    )
    await expect(authPost('http://api/v3/signup', {})).rejects.toThrow('field required')
  })
})
