/**
 * Token payload extracted from a web10 JWT.
 */
export interface TokenPayload {
  username: string
  site: string
  target?: string
  provider: string
  expires?: string
  type?: string
}
