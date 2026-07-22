/**
 * Core web10 protocol types.
 *
 * These types describe the data model, query/update shapes, tokens,
 * terms/contracts, and aggregate pipeline that the SDK talks to.
 */

// ── Records ────────────────────────────────────────────────────────────────

/**
 * A web10 record is a document in a user's collection.
 * Every record has a `service` (string) and a `body` (arbitrary JSON).
 */
export interface Web10Record<TBody = Record<string, unknown>> {
  /** MongoDB ObjectId */
  _id?: string
  /** Service name (e.g. "posts", "contacts", "services", "*") */
  service: string
  /** Record payload */
  body: TBody
  /** Server-injected: token's username */
  _author?: string
  /** Server-injected: provider that minted the token */
  _source_node?: string
  /** Server-injected: server time at storage */
  _created_at?: string
}

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Query options for read operations.
 * Supports MongoDB-style operators: $sort, $skip, $limit, and
 * arbitrary field filters that get prefixed to `body.` by the API.
 */
export interface QueryOptions {
  /** Sort specification, e.g. `{ created_at: -1 }` */
  $sort?: Record<string, 1 | -1>
  /** Number of records to skip */
  $skip?: number
  /** Maximum number of records to return */
  $limit?: number
  /** Additional field filters (prefixed to `body.` server-side) */
  [key: string]: unknown
}

// ── Updates ────────────────────────────────────────────────────────────────

/**
 * Update specification for the update verb.
 * Supports MongoDB operators: $set, $unset, $inc, $push, $addToSet, $pull, $mul.
 * Field names are prefixed to `body.` server-side to protect top-level fields.
 */
export interface UpdateSpec {
  $set?: Record<string, unknown>
  $unset?: Record<string, string>
  $inc?: Record<string, number>
  $push?: Record<string, unknown>
  $addToSet?: Record<string, unknown>
  $pull?: Record<string, unknown>
  $mul?: Record<string, number>
  $currentDate?: Record<string, boolean | { $type: string }>
}

// ── Tokens ─────────────────────────────────────────────────────────────────

/**
 * Decoded payload of a web10 JWT token.
 */
export interface TokenPayload {
  /** Username */
  username: string
  /** App/site hostname */
  site: string
  /** Target provider (for tiered tokens) */
  target?: string
  /** Provider domain that minted this token */
  provider: string
  /** Expiration timestamp (seconds) */
  exp?: number
  /** Issued-at timestamp (seconds) */
  iat?: number
  /** Token type hint */
  type?: string
}

/**
 * Options for creating a web10 client instance.
 */
export interface ClientOptions {
  /** URL of the web10 authenticator (e.g. "https://auth.web10.app") */
  authUrl?: string
  /** API origin override (e.g. "https://api.web10.app") */
  apiOrigin?: string
  /** List of app store URLs to register with */
  appStores?: string[]
  /** RTC server hostname (for P2P, used by the /rtc subpath) */
  rtcServer?: string
}

/**
 * Runtime state of a web10 client.
 */
export interface ClientState {
  /** Resolved API protocol + host */
  apiOrigin: string
  /** Authenticator URL */
  authUrl: string
  /** Current JWT token (null when signed out) */
  token: string | null
  /** RTC server hostname */
  rtcServer: string
  /** App stores to register with */
  appStores: string[]
}

// ── Terms / Contracts ──────────────────────────────────────────────────────

/**
 * A terms record defines what an app (identified by `site`) may do
 * on a given `service`. Lives in the `services` collection.
 */
export interface TermsRecord extends Web10Record {
  service: 'services'
  body: {
    /** Target service this term applies to */
    service: string
    /** App/site granted access */
    site: string
    /** Allowed actions */
    allowed?: string[]
    /** Whitelisted users (for shared access) */
    whitelist?: Array<{ username: string; provider: string }>
    /** Blacklisted users */
    blacklist?: Array<{ username: string; provider: string }>
    /** Allowed cross-origin hosts */
    cross_origins?: string[]
  }
}

/**
 * A Service-Info-Request (SIR) describes what access an app is requesting.
 */
export interface SIR {
  /** Service to access */
  service: string
  /** Actions requested */
  allowed?: string[]
}

/**
 * A Service-Change-Request (SCR) describes additive changes to an existing contract.
 */
export interface SCR {
  /** Service to modify */
  service: string
  /** Actions to add */
  allowed?: string[]
}

// ── Aggregate Pipeline ─────────────────────────────────────────────────────

/**
 * Allowed aggregate pipeline stages.
 * The server validates and sandboxes the pipeline — it runs on body-only
 * docs scoped to the service, with a denylist of dangerous operators.
 */
export type PipelineStage =
  | { $match: Record<string, unknown> }
  | { $project: Record<string, unknown> }
  | { $group: Record<string, unknown> }
  | { $sort: Record<string, 1 | -1> }
  | { $skip: number }
  | { $limit: number }
  | { $unwind: string | Record<string, unknown> }
  | { $addFields: Record<string, unknown> }
  | { $count: string }
  | { $facet: Array<{ name: string; pipeline: PipelineStage[] }> }
  | { $bucket: Record<string, unknown> }
  | { $sample: { size: number } }

/**
 * An aggregation pipeline — an array of stages.
 */
export type Pipeline = PipelineStage[]

// ── API Responses ──────────────────────────────────────────────────────────

/**
 * Response from a create operation.
 */
export interface CreateResponse {
  /** MongoDB ObjectId of the created record */
  _id: string
}

/**
 * Response from an update operation.
 */
export interface UpdateResponse {
  /** Number of documents matched */
  matchedCount: number
  /** Number of documents modified */
  modifiedCount: number
  /** The updated document (if available) */
  document?: Web10Record
}

/**
 * Response from a delete operation.
 */
export interface DeleteResponse {
  /** Number of documents deleted */
  deletedCount: number
}

/**
 * Response from a token mint/login.
 */
export interface TokenResponse {
  token: string
}

/**
 * Response from a signup.
 */
export interface SignupResponse {
  ok: boolean
  /** May include a token if auto-login is enabled */
  token?: string
}

// ── Dev Pay ────────────────────────────────────────────────────────────────

/**
 * Parameters for creating a Stripe checkout session.
 */
export interface CheckoutParams {
  /** Seller's web10 address */
  seller: string
  /** Product title */
  title: string
  /** Price in cents */
  price: number
  /** Redirect URL on success */
  success_url: string
  /** Redirect URL on cancellation */
  cancel_url: string
}

/**
 * Parameters for verifying or cancelling a subscription.
 */
export interface SubscriptionParams {
  /** Seller's web10 address */
  seller: string
  /** Product title */
  title: string
}

// ── Auth (wapiAuth) ────────────────────────────────────────────────────────

/**
 * Parameters for login.
 */
export interface LoginParams {
  /** Provider domain */
  provider: string
  /** Username */
  username: string
  /** Password */
  password: string
}

/**
 * Parameters for signup.
 */
export interface SignupParams {
  /** Provider domain */
  provider: string
  /** Username */
  username: string
  /** Password */
  password: string
  /** Beta code (if required) */
  betacode?: string
  /** Phone number (if required) */
  phone?: string
}

/**
 * Plan info returned by getPlan.
 */
export interface PlanInfo {
  space?: number
  credits?: number
  plan?: string
}
