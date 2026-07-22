/**
 * Token utilities: cookie management, JWT decode, persistence.
 */

import type { TokenPayload } from './types'

/**
 * Parse cookies into a dictionary.
 */
export function cookieDict(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  return document.cookie.split(';').reduce((res, c) => {
    const eq = c.indexOf('=')
    if (eq === -1) return res
    const key = c.substring(0, eq).trim()
    const val = c.substring(eq + 1).trim()
    try {
      res[key] = JSON.parse(decodeURIComponent(val))
    } catch {
      res[key] = decodeURIComponent(val)
    }
    return res
  }, {} as Record<string, string>)
}

/**
 * Read the web10 token from cookies.
 */
export function readTokenCookie(): string | null {
  const cookies = cookieDict()
  const raw = cookies['token']
  if (!raw) return null
  // The cookie may have been stored as a JSON string
  try {
    return typeof raw === 'string' ? raw : String(raw)
  } catch {
    return null
  }
}

/**
 * Set the web10 token cookie.
 * @param token - JWT token string
 * @param maxAgeDays - Cookie lifetime in days (default 60)
 */
export function setTokenCookie(token: string, maxAgeDays = 60): void {
  if (typeof document === 'undefined') return
  const age = 3600 * 24 * maxAgeDays
  // Only set Secure flag on HTTPS origins
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? 'Secure;' : ''
  document.cookie = `token=${token};${secure}path=/;max-age=${age};`
}

/**
 * Remove the web10 token cookie.
 */
export function scrubTokenCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = 'token=;max-age=-1;path=/;'
}

/**
 * Decode a JWT payload without verification.
 * Returns `null` if the token is missing or malformed.
 *
 * @param token - JWT string
 */
export function decodeJwt(token: string | null): TokenPayload | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    return JSON.parse(atob(parts[1])) as TokenPayload
  } catch {
    return null
  }
}

/**
 * Check if a token is expired based on its `exp` claim.
 */
export function isTokenExpired(token: string | null): boolean {
  const payload = decodeJwt(token)
  if (!payload || !payload.exp) return false
  return Date.now() >= payload.exp * 1000
}
