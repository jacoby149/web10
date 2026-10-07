import { afterEach, describe, expect, it } from 'vitest'
import { cookieDict, decodeJwt, readTokenCookie, scrubTokenCookie, setTokenCookie } from './token'

afterEach(() => {
  for (const key of Object.keys(cookieDict())) document.cookie = `${key}=;max-age=-1;path=/;`
  scrubTokenCookie()
})

describe('token storage boundary', () => {
  it('encodes cookie delimiters instead of allowing attribute injection', () => {
    const value = 'abc;path=/other;SameSite=None'
    setTokenCookie(value)
    expect(readTokenCookie()).toBe(value)
    expect(document.cookie).toContain('token=abc%3Bpath%3D')
  })

  it('ignores malformed percent encoding in unrelated cookies', () => {
    document.cookie = 'broken=%E0%A4%A;path=/;'
    setTokenCookie('valid')
    expect(readTokenCookie()).toBe('valid')
  })

  it('does not allow cookie names to mutate the dictionary prototype', () => {
    document.cookie = '__proto__=%7B%22polluted%22%3Atrue%7D;path=/;'
    expect(Object.getPrototypeOf(cookieDict())).toBe(null)
  })
})

describe('unverified JWT metadata', () => {
  it('decodes UTF-8 base64url payloads', () => {
    const payload = { username: 'user', note: '\u00ff\u00ff' }
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeJwt(`header.${encoded}.signature`)).toEqual(payload)
  })

  it('rejects non-object payloads and incomplete JWTs', () => {
    expect(decodeJwt(`header.${btoa('null')}.signature`)).toBeNull()
    expect(decodeJwt(`header.${btoa('[]')}.signature`)).toBeNull()
    expect(decodeJwt(`header.${btoa('{}')}`)).toBeNull()
  })
})
