/**
 * web10-npm — TypeScript SDK for the web10 protocol.
 *
 * Zero required dependencies. Uses native fetch. Full types for
 * records, queries, updates, terms/contracts, tokens, and aggregate
 * pipelines.
 *
 * @module web10-npm
 */

// Protocol types
export type {
  Web10Record,
  QueryOptions,
  UpdateSpec,
  TokenPayload,
  ClientOptions,
  ClientState,
  TermsRecord,
  SIR,
  SCR,
  ACR,
  GCR,
  ContractRequest,
  PipelineStage,
  Pipeline,
  CreateResponse,
  UpdateResponse,
  DeleteResponse,
  TokenResponse,
  SignupResponse,
  CheckoutParams,
  SubscriptionParams,
  LoginParams,
  SignupParams,
  PlanInfo,
  MediaUploadUrlParams,
  MediaUploadUrlResponse,
  MediaConfirmParams,
  MediaRecord,
  MediaReadUrlResponse,
} from './types'

// Client
export { createClient, type Web10Client } from './client'

// Auth connector
export { createAuthConnector, type AuthConnector } from './auth'

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

// V3 client (ClickHouse-backed API)
export { createV3Client, type V3Client } from './v3'
export type {
  V3ClientOptions,
  V3Document,
  V3Group,
  V3GroupMember,
  V3InviteResponse,
  V3ServiceContract,
  V3User,
  V3LoginResponse,
} from './v3'

// Legacy compat shim — re-exports wapiInit / wapiAuthInit for apps still
// using the old JS SDK API (ui/, web10-social/).
export { wapiInit, wapiAuthInit } from './compat'
