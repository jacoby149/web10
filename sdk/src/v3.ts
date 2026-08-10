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
}

interface V3State {
  apiOrigin: string
  token: string | null
}

// ── Request body shape (mirrors api/app/v3/models/__init__.py Token) ────────

interface V3Body {
  token?: string | null
  [key: string]: unknown
}

// ── Response types ──────────────────────────────────────────────────────────

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
  const state: V3State = {
    apiOrigin,
    token: options.token ?? readTokenCookie(),
  }

  async function v3Post<T>(action: string, body: V3Body): Promise<T> {
    if (!state.token) {
      throw new Web10Error('No token available. Call login() or setToken() first.', 401)
    }
    return authPost<T>(`${apiOrigin}/v3/${action}`, { ...body, token: state.token })
  }

  const client: V3Client = {
    // ── Token management ──────────────────────────────────────────────────

    get state() {
      return { ...state }
    },

    setToken(token: string): void {
      state.token = token
      setTokenCookie(token)
    },

    scrubToken(): void {
      state.token = null
      scrubTokenCookie()
    },

    readToken(): TokenPayload | null {
      return decodeJwt(state.token)
    },

    isSignedIn(): boolean {
      return state.token != null && state.token !== ''
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
      opts?: { groups?: string[] },
    ): Promise<V3Document> {
      const payload: V3Body = { collection, body }
      if (opts?.groups) payload.groups = opts.groups
      return v3Post<V3Document>('create', payload)
    },

    async read(
      collection: string,
      opts: { groups: string[]; limit?: number; offset?: number },
    ): Promise<V3Document[]> {
      const payload: V3Body = { collection, groups: opts.groups }
      if (opts.limit != null) payload.limit = opts.limit
      if (opts.offset != null) payload.offset = opts.offset
      return v3Post<V3Document[]>('read', payload)
    },

    async readById(
      docId: string,
      collection: string,
    ): Promise<V3Document> {
      return v3Post<V3Document>('read-by-id', { doc_id: docId, collection })
    },

    async update(
      docId: string,
      body: Record<string, unknown>,
      opts?: { groups?: string[] },
    ): Promise<V3Document> {
      const payload: V3Body = { doc_id: docId, body }
      if (opts?.groups) payload.groups = opts.groups
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
      return v3Post<{ user_key: string; group_id: string; blocked_key: string }>('block-in-group', {
        blocked_key: blockedKey,
        group_id: groupId,
      })
    },

    async unblockUserInGroup(
      blockedKey: string,
      groupId: string,
    ): Promise<{ user_key: string; group_id: string; blocked_key: string }> {
      return v3Post<{ user_key: string; group_id: string; blocked_key: string }>('unblock-in-group', {
        blocked_key: blockedKey,
        group_id: groupId,
      })
    },

    // ── Sharing toggle ────────────────────────────────────────────────────

    async setSharing(groupId: string, enabled: boolean): Promise<{ user_key: string; group_id: string; sharing_enabled: boolean }> {
      return v3Post<{ user_key: string; group_id: string; sharing_enabled: boolean }>('sharing/set', {
        group_id: groupId,
        enabled,
      })
    },

    // ── Media ─────────────────────────────────────────────────────────────

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
      return v3Post<{ url: string; review_state: string }>('apps/register', { body: app })
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
  }

  return client
}

/**
 * The v3 client interface.
 */
export interface V3Client {
  state: { apiOrigin: string; token: string | null }

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
  create(collection: string, body: Record<string, unknown>, opts?: { groups?: string[] }): Promise<V3Document>
  read(collection: string, opts: { groups: string[]; limit?: number; offset?: number }): Promise<V3Document[]>
  readById(docId: string, collection: string): Promise<V3Document>
  update(docId: string, body: Record<string, unknown>, opts?: { groups?: string[] }): Promise<V3Document>
  delete(docId: string): Promise<{ doc_id: string; status: string }>

  // App contracts (per-app with per-service permissions)
  addAppContract(allowedOrigin: string, permissions: Record<string, string[]>): Promise<V3ServiceContract>
  listAppContracts(): Promise<V3ServiceContract[]>
  revokeAppContract(allowedOrigin?: string): Promise<{ status: string }>

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
}