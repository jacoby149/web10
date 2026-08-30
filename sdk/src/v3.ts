/**
 * web10 v3 client — calls the ClickHouse-backed v3 API.
 *
 * Unlike the v2 client (PATCH/POST/PUT/DELETE per collection), the v3 API
 * uses a unified POST pattern: every endpoint is `POST /v3/<action>` with
 * a single JSON body that carries the token + all parameters.
 *
 * @example
 * ```ts
 * import { createV3Client } from 'web10-npm'
 *
 * const w = createV3Client({ apiOrigin: 'https://api.web10.app' })
 *
 * // Auth
 * await w.login('alice', 'password')
 *
 * // CRUD with groups
 * const doc = await w.create('posts', { text: 'hello' }, { groups: ['web10.app/groups/web10/discover'] })
 * const posts = await w.read('posts', { groups: ['me'] })
 *
 * // Service contracts
 * await w.addServiceContract('my-app', 'https://my-app.example.com')
 * const contracts = await w.listServiceContracts()
 *
 * // Groups
 * await w.createGroup('my-community', 'open', roles, [{ member_key: 'alice', role: 'owner' }])
 * const groups = await w.getMyGroups()
 * ```
 */

import { authPost, Web10Error } from './http'
import { decodeJwt, readTokenCookie, setTokenCookie, scrubTokenCookie } from './token'
import type { TokenPayload } from './types'

// ── Options & State ────────────────────────────────────────────────────────

export interface V3ClientOptions {
  /** API origin (e.g. "https://api.web10.app" or "http://api.localhost") */
  apiOrigin?: string
  /** Pre-set token (optional, for server-side or pre-auth scenarios) */
  token?: string | null
  /** RTC server hostname (for P2P via web10-npm/rtc) */
  rtcServer?: string
}

interface V3State {
  apiOrigin: string
  token: string | null
  rtcServer: string
}

// ── Request body shape (mirrors api/app/v3/models/__init__.py Token) ────────

interface V3Body {
  token?: string | null
  [key: string]: unknown
}

// ── Response types ──────────────────────────────────────────────────────────

// The v3 ad preference (ads-dissemination.md): a document's ad is `none`
// (no ad) or `pinned` (a specific ad, by `target` doc_id). The read serves a
// pinned doc with its ad inline, I3-checked. v4 grows this to a curation engine.
export interface V3AdPreference {
  mode: 'none' | 'pinned'
  target?: string
}

export interface V3Document {
  doc_id: string
  author_key: string
  collection_name: string
  body: Record<string, unknown>
  ref_value?: string
  tags?: string[]
  created_at: string
  updated_at: string
  groups?: string[]
  // The v3 ad preference (ads-dissemination.md): `ad_mode` is `none` | `pinned`,
  // `ad_target` is the pinned ad's doc_id. The read serves a pinned doc with its
  // ad inline under `ad`.
  ad_mode?: string
  ad_target?: string
  ad?: V3Document
}

export interface V3Group {
  group_id: string
  join_policy: string
  my_role: string
  member_count: number
  roles?: Record<string, unknown>[]
}

export interface V3GroupMember {
  group_id?: string
  member_key: string
  role: string
  joined_at?: string
  status?: string
}

export interface V3InviteResponse {
  group_id: string
  invited_key: string
  status: string
}

export interface V3JoinRequest {
  requester_key: string
  status: string
  requested_at: string
}

export interface V3ServiceContract {
  allowed_origin: string
  permissions: Record<string, string[]>
}

// Group role definition — each role has a name, scope (services), and permissions.
export interface V3GroupRole {
  name: string
  services: string[]
  permissions: string[]
}

// Group member definition
export interface V3GroupMemberCR {
  member_key: string
  role: string
}

// App contract request — grants an app access to specific services/permissions.
export interface V3AppCR {
  kind: 'app'
  /** Website origin requesting access */
  app_origin: string
  /** Per-service permissions */
  permissions: Record<string, string[]>
}

// Group contract request — creates or modifies a group with roles, members, policy.
export interface V3GroupCR {
  kind: 'group'
  /** Website origin making the request */
  app_origin: string
  /** Operation: create_group, update_group, join_group, etc. */
  action: string
  /** Group name (create_group) */
  name?: string
  /** Join policy: open, request, invite_only */
  join_policy?: string
  /** Roles with service-specific permissions */
  roles?: V3GroupRole[]
  /** Initial members */
  members?: V3GroupMemberCR[]
  /** Existing group ID (update_group) */
  group_id?: string
}

// Unified contract request — app or group.
export type V3CR = V3AppCR | V3GroupCR

export interface V3User {
  username: string
  phone?: string
  email?: string
  phone_verified?: boolean
  email_verified?: boolean
}

export interface V3LoginResponse {
  token: string
}

// ── Client factory ─────────────────────────────────────────────────────────

/**
 * Create a v3 client instance.
 */
export function createV3Client(options: V3ClientOptions = {}): V3Client {
  const apiOrigin = options.apiOrigin ?? 'https://api.web10.app'
  const rtcServer = options.rtcServer ?? 'rtc.web10.app'
  const state: V3State = {
    apiOrigin,
    token: options.token ?? readTokenCookie(),
    rtcServer,
  }

  async function v3Post<T>(action: string, body: V3Body): Promise<T> {
    // Read token from state, falling back to the cookie. authListen sets the
    // cookie but doesn't sync state.token, so cookie fallback is essential.
    const token = state.token ?? readTokenCookie()
    if (!token) {
      throw new Web10Error('No token available. Call login() or setToken() first.', 401)
    }
    return authPost<T>(`${apiOrigin}/v3/${action}`, { ...body, token })
  }

  // D49: register this app with the node's app store (best-effort). The
  // identity is the full URL, path included (a path is an app, D47) — query
  // and fragment stripped. The token rides along when present so the node can
  // attribute the visit to a real user (anon pings are dropped at ingest).
  // Fire-and-forget: registration must never block or break app init. The
  // node gates to 1 counted visit per (app, user) per 3h, so re-firing on
  // sign-in is safe (the server dedupes).
  function pingAppRegister(): void {
    if (typeof window === 'undefined' || typeof window.location?.href !== 'string') return
    try {
      const token = state.token ?? readTokenCookie()
      // Canonical app identity (D47): the full URL minus query/fragment,
      // with a trailing /index.html collapsed to the directory — the
      // directory IS the app (index.html is just how the server serves it).
      // Without the collapse, loading a demo via its /index.html link forks
      // the identity into a second store entry whose manifest lookup 404s.
      const rawUrl = window.location.href.split(/[?#]/)[0]
      const url = rawUrl.replace(/\/index\.html$/, '/')
      const body: Record<string, unknown> = { url }
      if (token) body.token = token
      fetch(`${apiOrigin}/v3/apps/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }).catch(() => {})
    } catch {
      // fetch not available (SSR, test env)
    }
  }

  const client: V3Client = {
    // ── Token management ──────────────────────────────────────────────────

    get state() {
      return { ...state }
    },

    setToken(token: string): void {
      state.token = token
      setTokenCookie(token)
      // D49: re-fire the register ping now that a real user is signed in —
      // the init ping may have been anon (pre-sign-in) and dropped at ingest.
      pingAppRegister()
    },

    scrubToken(): void {
      state.token = null
      scrubTokenCookie()
    },

    readToken(): TokenPayload | null {
      const current = readTokenCookie() ?? state.token
      return current ? decodeJwt(current) : null
    },

    isSignedIn(): boolean {
      const current = readTokenCookie() ?? state.token
      return current != null && current !== ''
    },

    signOut(): void {
      this.scrubToken()
    },

    // ── Auth ──────────────────────────────────────────────────────────────

    async login(username: string, password: string, site?: string): Promise<V3LoginResponse> {
      const res = await authPost<V3LoginResponse>(
        `${apiOrigin}/v3/login`,
        { username, password, site: site ?? window?.location?.hostname ?? 'web10' },
      )
      this.setToken(res.token)
      return res
    },

    async signup(username: string, password: string, phone?: string, email?: string): Promise<V3User> {
      return authPost<V3User>(`${apiOrigin}/v3/signup`, { username, password, phone, email })
    },

    async getProfile(): Promise<V3User> {
      return v3Post<V3User>('profile', {})
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<{ status: string }> {
      return v3Post<{ status: string }>('change-pass', { password: currentPassword, new_pass: newPassword })
    },

    async changePhone(phone: string): Promise<{ phone: string }> {
      return v3Post<{ phone: string }>('change-phone', { phone })
    },

    async setEmail(email: string): Promise<{ email: string }> {
      return v3Post<{ email: string }>('set-email', { email })
    },

    async verifyPhone(code: string): Promise<{ phone_verified: boolean }> {
      return v3Post<{ phone_verified: boolean }>('verify-phone', { code })
    },

    async verifyEmail(code: string): Promise<{ email_verified: boolean }> {
      return v3Post<{ email_verified: boolean }>('verify-email', { code })
    },

    async sendCode(): Promise<{ sent: boolean }> {
      return v3Post<{ sent: boolean }>('send_code', {})
    },

    async setRecoveryPhone(phone: string): Promise<{ phone_number: string }> {
      return v3Post<{ phone_number: string }>('set_recovery_phone', { query: { phone } })
    },

    // ── CRUD with groups ──────────────────────────────────────────────────

    async create(
      collection: string,
      body: Record<string, unknown>,
      opts?: { groups?: string[]; ad_preference?: V3AdPreference },
    ): Promise<V3Document> {
      const payload: V3Body = { service: collection, body }
      if (opts?.groups) payload.groups = opts.groups
      if (opts?.ad_preference) payload.ad_preference = opts.ad_preference
      return v3Post<V3Document>('create', payload)
    },

    async read(
      collection: string,
      opts: { groups: string[]; limit?: number; offset?: number },
    ): Promise<V3Document[]> {
      const payload: V3Body = { service: collection, groups: opts.groups }
      if (opts.limit != null) payload.limit = opts.limit
      if (opts.offset != null) payload.offset = opts.offset
      return v3Post<V3Document[]>('read', payload)
    },

    async readById(
      docId: string,
      collection: string,
    ): Promise<V3Document> {
      // The API merged read-by-id into read (optional doc_id param, #537) —
      // the doc_id path returns a single document, not an array.
      return v3Post<V3Document>('read', { doc_id: docId, service: collection })
    },

    async update(
      docId: string,
      body: Record<string, unknown>,
      opts?: { groups?: string[]; ad_preference?: V3AdPreference },
    ): Promise<V3Document> {
      const payload: V3Body = { doc_id: docId, body }
      if (opts?.groups) payload.groups = opts.groups
      if (opts?.ad_preference) payload.ad_preference = opts.ad_preference
      return v3Post<V3Document>('update', payload)
    },

    async delete(docId: string): Promise<{ doc_id: string; status: string }> {
      return v3Post<{ doc_id: string; status: string }>('delete', { doc_id: docId })
    },

    // ── App contracts (per-app with per-service permissions) ──────────────

    async addAppContract(
      allowedOrigin: string,
      permissions: Record<string, string[]>,
    ): Promise<V3ServiceContract> {
      return v3Post<V3ServiceContract>('app-contracts/add', {
        allowed_origin: allowedOrigin,
        permissions,
      })
    },

    async listAppContracts(): Promise<V3ServiceContract[]> {
      return v3Post<V3ServiceContract[]>('app-contracts/list', {})
    },

    async revokeAppContract(allowedOrigin?: string): Promise<{ status: string }> {
      const payload: V3Body = {}
      if (allowedOrigin) payload.allowed_origin = allowedOrigin
      return v3Post<{ status: string }>('app-contracts/revoke', payload)
    },

    // ── Groups ────────────────────────────────────────────────────────────

    async createGroup(
      name: string,
      joinPolicy: string,
      roles: Record<string, unknown>[],
      members: { member_key: string; role?: string }[],
    ): Promise<{ group_id: string }> {
      return v3Post<{ group_id: string }>('groups/create', {
        name,
        join_policy: joinPolicy,
        roles,
        members,
      })
    },

    async getGroup(groupId: string): Promise<V3Group> {
      return v3Post<V3Group>('groups/get', { group_id: groupId })
    },

    async getMyGroups(): Promise<V3Group[]> {
      return v3Post<V3Group[]>('groups/list', {})
    },

    async getGroupsManages(): Promise<V3Group[]> {
      return v3Post<V3Group[]>('groups/manages', {})
    },

    async updateGroup(
      groupId: string,
      opts?: { join_policy?: string; roles?: Record<string, unknown>[] },
    ): Promise<V3Group> {
      const payload: V3Body = { group_id: groupId }
      if (opts?.join_policy) payload.join_policy = opts.join_policy
      if (opts?.roles) payload.roles = opts.roles
      return v3Post<V3Group>('groups/update', payload)
    },

    async joinGroup(groupId: string): Promise<V3GroupMember | { group_id: string; status: string }> {
      return v3Post<V3GroupMember | { group_id: string; status: string }>('groups/join', { group_id: groupId })
    },

    async requestJoin(groupId: string): Promise<{ group_id: string; status: string }> {
      // Same endpoint as joinGroup — the API checks join_policy and creates
      // a pending request for non-open groups. The KB documents this as a
      // separate call; we expose it separately for intent clarity.
      return v3Post<{ group_id: string; status: string }>('groups/join', { group_id: groupId })
    },

    async leaveGroup(groupId: string): Promise<V3GroupMember> {
      return v3Post<V3GroupMember>('groups/leave', { group_id: groupId })
    },

    async getGroupMembers(groupId: string): Promise<V3GroupMember[]> {
      return v3Post<V3GroupMember[]>('groups/members/list', { group_id: groupId })
    },

    async addGroupMember(
      groupId: string,
      memberKey: string,
      role: string,
    ): Promise<V3GroupMember> {
      return v3Post<V3GroupMember>('groups/members/add', {
        group_id: groupId,
        member_key: memberKey,
        role,
      })
    },

    async removeGroupMember(
      groupId: string,
      memberKey: string,
    ): Promise<V3GroupMember> {
      return v3Post<V3GroupMember>('groups/members/remove', {
        group_id: groupId,
        member_key: memberKey,
      })
    },

    async inviteMember(
      groupId: string,
      memberKey: string,
      role: string,
    ): Promise<V3InviteResponse> {
      return v3Post<V3InviteResponse>('groups/invite', {
        group_id: groupId,
        member_key: memberKey,
        role,
      })
    },

    async acceptInvite(groupId: string): Promise<V3GroupMember> {
      return v3Post<V3GroupMember>('groups/accept-invite', { group_id: groupId })
    },

    async declineInvite(groupId: string): Promise<{ group_id: string; status: string }> {
      return v3Post<{ group_id: string; status: string }>('groups/decline-invite', { group_id: groupId })
    },

    // ── Join request management (owner/moderator) ──────────────────────────

    async getJoinRequests(groupId: string): Promise<V3JoinRequest[]> {
      return v3Post<V3JoinRequest[]>('groups/requests/join/list', { group_id: groupId })
    },

    async approveJoinRequest(
      groupId: string,
      requesterKey: string,
    ): Promise<{ group_id: string; requester_key: string; status: string }> {
      return v3Post<{ group_id: string; requester_key: string; status: string }>('groups/requests/join/approve', {
        group_id: groupId,
        requester_key: requesterKey,
      })
    },

    async denyJoinRequest(
      groupId: string,
      requesterKey: string,
    ): Promise<{ group_id: string; requester_key: string; status: string }> {
      return v3Post<{ group_id: string; requester_key: string; status: string }>('groups/requests/join/deny', {
        group_id: groupId,
        requester_key: requesterKey,
      })
    },

    // ── Blocking ──────────────────────────────────────────────────────────

    async blockUser(blockedKey: string): Promise<{ user_key: string; blocked_key: string }> {
      return v3Post<{ user_key: string; blocked_key: string }>('block', { blocked_key: blockedKey })
    },

    async unblockUser(blockedKey: string): Promise<{ user_key: string; blocked_key: string }> {
      return v3Post<{ user_key: string; blocked_key: string }>('unblock', { blocked_key: blockedKey })
    },

    async blockUserInGroup(
      blockedKey: string,
      groupId: string,
    ): Promise<{ user_key: string; group_id: string; blocked_key: string }> {
      return v3Post<{ user_key: string; group_id: string; blocked_key: string }>('groups/block', {
        blocked_key: blockedKey,
        group_id: groupId,
      })
    },

    async unblockUserInGroup(
      blockedKey: string,
      groupId: string,
    ): Promise<{ user_key: string; group_id: string; blocked_key: string }> {
      return v3Post<{ user_key: string; group_id: string; blocked_key: string }>('groups/unblock', {
        blocked_key: blockedKey,
        group_id: groupId,
      })
    },

    // ── Sharing toggle ────────────────────────────────────────────────────

    async setSharing(groupId: string, enabled: boolean): Promise<{ user_key: string; group_id: string; sharing_enabled: boolean }> {
      return v3Post<{ user_key: string; group_id: string; sharing_enabled: boolean }>('groups/sharing/set', {
        group_id: groupId,
        enabled,
      })
    },

    // ── Media ─────────────────────────────────────────────────────────────

    async requestMediaUploadUrl(
      params: { filename: string; mimeType?: string; sizeBytes?: number },
    ): Promise<{ upload_url: string; fields: Record<string, string>; object_key: string; content_type: string }> {
      return v3Post('media/upload-url', {
        body: {
          filename: params.filename,
          mime_type: params.mimeType ?? 'application/octet-stream',
          size_bytes: params.sizeBytes ?? null,
        },
      })
    },

    async getMediaReadUrl(
      objectKey: string,
    ): Promise<{ read_url: string; expires_in: number }> {
      return v3Post('media/read-url', { body: { object_key: objectKey } })
    },

    async confirmMediaUpload(metadata: Record<string, unknown>): Promise<V3Document> {
      return v3Post<V3Document>('media/confirm', { body: metadata })
    },

    async listMedia(opts?: { limit?: number; offset?: number }): Promise<V3Document[]> {
      const payload: V3Body = {}
      if (opts?.limit != null) payload.limit = opts.limit
      if (opts?.offset != null) payload.offset = opts.offset
      return v3Post<V3Document[]>('media/list', payload)
    },

    async deleteMedia(docId: string): Promise<{ doc_id: string; status: string }> {
      return v3Post<{ doc_id: string; status: string }>('media/delete', { doc_id: docId })
    },

    // ── Node stats ────────────────────────────────────────────────────────

    async getNodeStats(): Promise<{ users: number; documents: number; groups: number }> {
      return v3Post<{ users: number; documents: number; groups: number }>('stats', {})
    },

    // ── App Store ─────────────────────────────────────────────────────────

    async registerApp(app: { url: string; name?: string; description?: string; icon_url?: string; screenshots?: unknown[] }): Promise<{ url: string; review_state: string }> {
      // Anonymous — the node's /v3/apps/register takes no token (the app
      // identifies itself by url). Works signed-out, like v2.
      return authPost<{ url: string; review_state: string }>(`${apiOrigin}/v3/apps/register`, { body: app })
    },

    async getApps(): Promise<{ url: string; name: string; description: string; icon_url: string; screenshots: unknown[]; review_state: string; metadata_version: number }[]> {
      return v3Post('apps/list', {})
    },

    async rateApp(appId: string, rating: number): Promise<{ author: string; target_app_id: string; rating: number }> {
      if (!rating || rating < 1 || rating > 5) {
        throw new Web10Error('Rating must be between 1 and 5', 400)
      }
      return v3Post<{ author: string; target_app_id: string; rating: number }>('apps/rating', { body: { target_app_id: appId, rating } })
    },

    async getAppRatings(appId: string): Promise<{ author: string; rating: number; provider: string; created_at: string }[]> {
      return v3Post<{ author: string; rating: number; provider: string; created_at: string }[]>('apps/ratings', { body: { target_app_id: appId } })
    },

    // ── Contract requests (unified: ACR + GCR, one flow) ────────────────────

    /**
     * Request contracts from the user via the auth UI.
     *
     * Opens the authenticator in a popup, sends all contract requests
     * (ACR for app access, GCR for group operations) in one batch.
     * The user approves or denies each request in the auth UI.
     *
     * @param contracts — array of ACR and/or GCR requests
     * @param authOrigin — origin of the authenticator (e.g. 'https://auth.web10.app')
     * @param callback — called with { status: 'approved' | 'denied' | 'error', errors? }
     */
    contractRequest(
      contracts: V3CR[],
      authOrigin: string,
      callback?: (response: { status: string; errors?: string[] }) => void,
    ): void {
      if (typeof window === 'undefined') {
        if (callback) callback({ status: 'error', errors: ['Not in a browser'] })
        return
      }

      const popup = window.open(
        `${authOrigin}`,
        'web10-consent',
        'width=480,height=720,scrollbars=yes',
      )
      if (!popup) {
        if (callback) callback({ status: 'error', errors: ['Popup blocked — allow popups and try again'] })
        return
      }

      // Listen for contract_response from the auth UI
      const responseHandler = (e: MessageEvent) => {
        if (e.data?.type === 'contract_response') {
          window.removeEventListener('message', responseHandler)
          window.removeEventListener('message', readyHandler)
          clearTimeout(timeoutId)
          callback?.(e.data)
        }
      }
      window.addEventListener('message', responseHandler)

      // Wait for auth UI to signal readiness before sending contracts
      const readyHandler = (e: MessageEvent) => {
        if (e.data?.type === 'auth_ready') {
          window.removeEventListener('message', readyHandler)
          try {
            popup.postMessage({ type: 'contract', contracts }, authOrigin)
          } catch {
            window.removeEventListener('message', responseHandler)
            clearTimeout(timeoutId)
            callback?.({ status: 'error', errors: ['Failed to send contract request to auth UI'] })
          }
        }
      }
      window.addEventListener('message', readyHandler)

      // Timeout if auth popup closes without response (30s)
      const timeoutId = setTimeout(() => {
        window.removeEventListener('message', responseHandler)
        window.removeEventListener('message', readyHandler)
        callback?.({ status: 'error', errors: ['Auth popup closed — request cancelled'] })
      }, 30000)
    },

    /**
     * Legacy: send contracts to the opener (authenticator that opened this app).
     * Kept for backward compatibility — prefer contractRequest().
     */
    contractOnReady(
contracts: V3CR[],
      callback?: (response: { status: string; errors?: string[] }) => void,
    ): void {
      if (typeof window === 'undefined' || !window.opener) {
        if (callback) callback({ status: 'error', errors: ['No opener window — not in a popup'] })
        return
      }
      if (callback) {
        const handler = (e: MessageEvent) => {
          if (e.data?.type === 'contract_response') {
            window.removeEventListener('message', handler)
            callback(e.data)
          }
        }
        window.addEventListener('message', handler)
      }
      window.opener.postMessage(
        { type: 'contract', contracts },
        '*',
      )
    },
  }

  // D49: register on init. Covers return-runs (the cookie token is present,
  // so the visit is attributed to the real user); a fresh pre-sign-in load
  // pings anon (dropped at ingest) and re-fires on setToken at sign-in.
  pingAppRegister()

  return client
}

/**
 * The v3 client interface.
 */
export interface V3Client {
  state: { apiOrigin: string; token: string | null; rtcServer: string }

  // Token management
  setToken(token: string): void
  scrubToken(): void
  readToken(): TokenPayload | null
  isSignedIn(): boolean
  signOut(): void

  // Auth
  login(username: string, password: string, site?: string): Promise<V3LoginResponse>
  signup(username: string, password: string, phone?: string, email?: string): Promise<V3User>
  getProfile(): Promise<V3User>
  changePassword(currentPassword: string, newPassword: string): Promise<{ status: string }>
  changePhone(phone: string): Promise<{ phone: string }>
  setEmail(email: string): Promise<{ email: string }>
  verifyPhone(code: string): Promise<{ phone_verified: boolean }>
  verifyEmail(code: string): Promise<{ email_verified: boolean }>
  sendCode(): Promise<{ sent: boolean }>
  setRecoveryPhone(phone: string): Promise<{ phone_number: string }>

  // CRUD with groups
  create(collection: string, body: Record<string, unknown>, opts?: { groups?: string[]; ad_preference?: V3AdPreference }): Promise<V3Document>
  read(collection: string, opts: { groups: string[]; limit?: number; offset?: number }): Promise<V3Document[]>
  readById(docId: string, collection: string): Promise<V3Document>
  update(docId: string, body: Record<string, unknown>, opts?: { groups?: string[]; ad_preference?: V3AdPreference }): Promise<V3Document>
  delete(docId: string): Promise<{ doc_id: string; status: string }>

  // App contracts (per-app with per-service permissions)
  addAppContract(allowedOrigin: string, permissions: Record<string, string[]>): Promise<V3ServiceContract>
  listAppContracts(): Promise<V3ServiceContract[]>
  revokeAppContract(allowedOrigin?: string): Promise<{ status: string }>

  // Contract requests — unified: ACR + GCR, one flow. Opens auth popup, sends contracts, waits for response.
  contractRequest(contracts: V3CR[], authOrigin: string, callback?: (response: { status: string; errors?: string[] }) => void): void

  // Legacy: send contracts to the opener (authenticator that opened this app)
  contractOnReady(contracts: V3CR[], callback?: (response: { status: string; errors?: string[] }) => void): void

  // Groups
  createGroup(name: string, joinPolicy: string, roles: Record<string, unknown>[], members: { member_key: string; role?: string }[]): Promise<{ group_id: string }>
  getGroup(groupId: string): Promise<V3Group>
  getMyGroups(): Promise<V3Group[]>
  getGroupsManages(): Promise<V3Group[]>
  updateGroup(groupId: string, opts?: { join_policy?: string; roles?: Record<string, unknown>[] }): Promise<V3Group>
  joinGroup(groupId: string): Promise<V3GroupMember | { group_id: string; status: string }>
  requestJoin(groupId: string): Promise<{ group_id: string; status: string }>
  leaveGroup(groupId: string): Promise<V3GroupMember>
  getGroupMembers(groupId: string): Promise<V3GroupMember[]>
  addGroupMember(groupId: string, memberKey: string, role: string): Promise<V3GroupMember>
  removeGroupMember(groupId: string, memberKey: string): Promise<V3GroupMember>
  inviteMember(groupId: string, memberKey: string, role: string): Promise<V3InviteResponse>
  acceptInvite(groupId: string): Promise<V3GroupMember>
  declineInvite(groupId: string): Promise<{ group_id: string; status: string }>

  // Join request management (owner/moderator)
  getJoinRequests(groupId: string): Promise<V3JoinRequest[]>
  approveJoinRequest(groupId: string, requesterKey: string): Promise<{ group_id: string; requester_key: string; status: string }>
  denyJoinRequest(groupId: string, requesterKey: string): Promise<{ group_id: string; requester_key: string; status: string }>

  // Blocking
  blockUser(blockedKey: string): Promise<{ user_key: string; blocked_key: string }>
  unblockUser(blockedKey: string): Promise<{ user_key: string; blocked_key: string }>
  blockUserInGroup(blockedKey: string, groupId: string): Promise<{ user_key: string; group_id: string; blocked_key: string }>
  unblockUserInGroup(blockedKey: string, groupId: string): Promise<{ user_key: string; group_id: string; blocked_key: string }>

  // Sharing
  setSharing(groupId: string, enabled: boolean): Promise<{ user_key: string; group_id: string; sharing_enabled: boolean }>

  // Media
  requestMediaUploadUrl(
    params: { filename: string; mimeType?: string; sizeBytes?: number },
  ): Promise<{ upload_url: string; fields: Record<string, string>; object_key: string; content_type: string }>
  getMediaReadUrl(objectKey: string): Promise<{ read_url: string; expires_in: number }>
  confirmMediaUpload(metadata: Record<string, unknown>): Promise<V3Document>
  listMedia(opts?: { limit?: number; offset?: number }): Promise<V3Document[]>
  deleteMedia(docId: string): Promise<{ doc_id: string; status: string }>

  // Stats
  getNodeStats(): Promise<{ users: number; documents: number; groups: number }>

  // App Store
  registerApp(app: { url: string; name?: string; description?: string; icon_url?: string; screenshots?: unknown[] }): Promise<{ url: string; review_state: string }>
  getApps(): Promise<{ url: string; name: string; description: string; icon_url: string; screenshots: unknown[]; review_state: string; metadata_version: number }[]>
  rateApp(appId: string, rating: number): Promise<{ author: string; target_app_id: string; rating: number }>
  getAppRatings(appId: string): Promise<{ author: string; rating: number; provider: string; created_at: string }[]>

  // Contract requests — unified CR type
  contractOnReady(contracts: V3CR[], callback?: (response: { status: string; errors?: string[] }) => void): void
}