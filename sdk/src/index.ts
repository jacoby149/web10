/**
 * web10-npm — TypeScript SDK for the web10 protocol.
 *
 * V3 only: ClickHouse-backed API, groups as the primitive,
 * CRUD with groups, app contracts, media, app store.
 *
 * @module web10-npm
 */

// V3 client
export { createV3Client, type V3Client } from './v3'
export type {
  V3ClientOptions,
  V3Document,
  V3Group,
  V3GroupMember,
  V3InviteResponse,
  V3JoinRequest,
  V3ServiceContract,
  V3CR,
  V3User,
  V3LoginResponse,
} from './v3'

// Token utilities
export {
  cookieDict,
  readTokenCookie,
  setTokenCookie,
  scrubTokenCookie,
  decodeJwt,
  isTokenExpired,
} from './token'

// HTTP
export { Web10Error } from './http'

// Shared types
export type { TokenPayload } from './types'
