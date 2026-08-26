import { API_ORIGIN } from '../lib/origins';

// ── SDK helpers (inlined from sdk/src/ — web10-npm@1.0.8 doesn't export them) ──

export interface TokenPayload {
  username: string;
  site: string;
  target?: string;
  provider: string;
  expires?: string;
  type?: string;
}

function cookieDict(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  return document.cookie.split(';').reduce((res, c) => {
    const eq = c.indexOf('=');
    if (eq === -1) return res;
    const key = c.substring(0, eq).trim();
    const val = c.substring(eq + 1).trim();
    try {
      res[key] = JSON.parse(decodeURIComponent(val));
    } catch {
      res[key] = decodeURIComponent(val);
    }
    return res;
  }, {} as Record<string, string>);
}

export function readTokenCookie(): string | null {
  const cookies = cookieDict();
  const raw = cookies['token'];
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? raw : String(raw);
  } catch {
    return null;
  }
}

export function setTokenCookie(token: string, maxAgeDays = 60): void {
  if (typeof document === 'undefined') return;
  const age = 3600 * 24 * maxAgeDays;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? 'Secure;' : '';
  document.cookie = `token=${token};${secure}path=/;max-age=${age};SameSite=Lax;`;
}

export function scrubTokenCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'token=;max-age=-1;path=/;';
}

export function decodeJwt(token: string | null): TokenPayload | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1])) as TokenPayload;
  } catch {
    return null;
  }
}

async function request<T>(method: string, url: string, body: Record<string, unknown>): Promise<T> {
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${method} ${url} failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function authPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
  return request<T>('POST', url, body);
}

// ── V3 types ────────────────────────────────────────────────────────────────

export interface V3Document {
  doc_id: string;
  author_key: string;
  collection_name: string;
  body: Record<string, unknown>;
  ref_value?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  groups?: string[];
  _id?: string;
}

export interface V3Group {
  group_id: string;
  join_policy: string;
  my_role: string;
  member_count: number;
  roles?: Record<string, unknown>[];
}

export interface V3GroupMember {
  group_id?: string;
  member_key: string;
  role: string;
  joined_at?: string;
  status?: string;
}

export interface V3User {
  username: string;
  phone?: string;
  email?: string;
  phone_verified?: boolean;
  email_verified?: boolean;
}

interface V3Body {
  token?: string | null;
  [key: string]: unknown;
}

// ── V3 client interface ─────────────────────────────────────────────────────

export interface V3Client {
  state: { apiOrigin: string; token: string | null }
  setToken(token: string): void
  scrubToken(): void
  readToken(): TokenPayload | null
  isSignedIn(): boolean
  signOut(): void

  login(username: string, password: string, site?: string): Promise<{ token: string }>
  signup(username: string, password: string, phone?: string, email?: string): Promise<V3User>
  getProfile(): Promise<V3User>
  changePassword(currentPassword: string, newPassword: string): Promise<{ status: string }>
  changePhone(phone: string): Promise<{ phone: string }>
  setEmail(email: string): Promise<{ email: string }>
  verifyPhone(code: string): Promise<{ phone_verified: boolean }>
  verifyEmail(code: string): Promise<{ email_verified: boolean }>
  sendCode(): Promise<{ sent: boolean }>
  setRecoveryPhone(phone: string): Promise<{ phone_number: string }>

  create(collection: string, body: Record<string, unknown>, opts?: { groups?: string[] }): Promise<V3Document>
  read(collection: string, opts: { groups: string[]; limit?: number; offset?: number }): Promise<V3Document[]>
  readById(docId: string, collection: string): Promise<V3Document>
  update(docId: string, body: Record<string, unknown>, opts?: { groups?: string[] }): Promise<V3Document>
  delete(docId: string): Promise<{ doc_id: string; status: string }>

  addAppContract(allowedOrigin: string, permissions: Record<string, string[]>): Promise<unknown>
  listAppContracts(): Promise<unknown[]>
  revokeAppContract(allowedOrigin?: string): Promise<{ status: string }>

  createGroup(name: string, joinPolicy: string, roles: Record<string, unknown>[], members: { member_key: string; role?: string }[], defaultRole?: string): Promise<{ group_id: string }>
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
  inviteMember(groupId: string, memberKey: string, role: string): Promise<{ group_id: string; invited_key: string; status: string }>
  acceptInvite(groupId: string): Promise<V3GroupMember>
  declineInvite(groupId: string): Promise<{ group_id: string; status: string }>

  getJoinRequests(groupId: string): Promise<{ requester_key: string; status: string; requested_at: string }[]>
  approveJoinRequest(groupId: string, requesterKey: string): Promise<{ group_id: string; requester_key: string; status: string }>
  denyJoinRequest(groupId: string, requesterKey: string): Promise<{ group_id: string; requester_key: string; status: string }>

  blockUser(blockedKey: string): Promise<{ user_key: string; blocked_key: string }>
  unblockUser(blockedKey: string): Promise<{ user_key: string; blocked_key: string }>
  blockUserInGroup(blockedKey: string, groupId: string): Promise<{ user_key: string; group_id: string; blocked_key: string }>
  unblockUserInGroup(blockedKey: string, groupId: string): Promise<{ user_key: string; group_id: string; blocked_key: string }>

  setSharing(groupId: string, enabled: boolean): Promise<{ user_key: string; group_id: string; sharing_enabled: boolean }>

  confirmMediaUpload(metadata: Record<string, unknown>): Promise<V3Document>
  listMedia(opts?: { limit?: number; offset?: number }): Promise<V3Document[]>
  deleteMedia(docId: string): Promise<{ doc_id: string; status: string }>

  getNodeStats(): Promise<{ users: number; documents: number; groups: number }>
  registerApp(app: { url: string; name?: string; description?: string; icon_url?: string; screenshots?: unknown[] }): Promise<{ url: string; review_state: string }>
  getApps(): Promise<unknown[]>
  rateApp(appId: string, rating: number): Promise<unknown>
  getAppRatings(appId: string): Promise<unknown[]>
}

// ── V3 client factory ────────────────────────────────────────────────────────

function createV3ClientFactory(apiOrigin: string): V3Client {
  // The token cookie is the session's source of truth (D46): the D42
  // authListen sets it on login and signOut scrubs it — both without
  // touching this client. So every request and every token read goes
  // through the cookie. The closure below is vestigial (setToken compat
  // only) — a request or read that trusted it would act as the PREVIOUS
  // user after a same-session sign-out -> re-login (the old adapter's
  // syncDataLayerToken mirror existed for exactly this; the cookie-first
  // read replaces it).
  let token: string | null = readTokenCookie();

  async function v3Post<T>(action: string, body: V3Body): Promise<T> {
    const t = readTokenCookie();
    if (!t) throw new Error('No token available. Call login() or setToken() first.');
    return authPost<T>(`${apiOrigin}/v3/${action}`, { ...body, token: t });
  }

  return {
    get state() { return { apiOrigin, token: readTokenCookie() }; },
    setToken(t: string) { token = t; setTokenCookie(t); },
    scrubToken() { token = null; scrubTokenCookie(); },
    readToken() { return decodeJwt(readTokenCookie()); },
    isSignedIn() { return readTokenCookie() != null; },
    signOut() { this.scrubToken(); },

    async login(username: string, password: string, site?: string): Promise<{ token: string }> {
      const res = await authPost<{ token: string }>(
        `${apiOrigin}/v3/login`,
        { username, password, site: site ?? (typeof window !== 'undefined' ? window.location.hostname : 'web10') },
      );
      this.setToken(res.token);
      return res;
    },
    async signup(username: string, password: string, phone?: string, email?: string): Promise<V3User> {
      return authPost<V3User>(`${apiOrigin}/v3/signup`, { username, password, phone, email });
    },
    async getProfile(): Promise<V3User> { return v3Post<V3User>('profile', {}); },
    async changePassword(currentPassword: string, newPassword: string): Promise<{ status: string }> {
      return v3Post<{ status: string }>('change-pass', { password: currentPassword, new_pass: newPassword });
    },
    async changePhone(phone: string): Promise<{ phone: string }> {
      return v3Post<{ phone: string }>('change-phone', { phone });
    },
    async setEmail(email: string): Promise<{ email: string }> {
      return v3Post<{ email: string }>('set-email', { email });
    },
    async verifyPhone(code: string): Promise<{ phone_verified: boolean }> {
      return v3Post<{ phone_verified: boolean }>('verify-phone', { code });
    },
    async verifyEmail(code: string): Promise<{ email_verified: boolean }> {
      return v3Post<{ email_verified: boolean }>('verify-email', { code });
    },
    async sendCode(): Promise<{ sent: boolean }> {
      return v3Post<{ sent: boolean }>('send_code', {});
    },
    async setRecoveryPhone(phone: string): Promise<{ phone_number: string }> {
      return v3Post<{ phone_number: string }>('set_recovery_phone', { query: { phone } });
    },

    async create(collection: string, body: Record<string, unknown>, opts?: { groups?: string[] }): Promise<V3Document> {
      const payload: V3Body = { collection, body };
      if (opts?.groups) payload.groups = opts.groups;
      return v3Post<V3Document>('create', payload);
    },
    async read(collection: string, opts: { groups: string[]; limit?: number; offset?: number }): Promise<V3Document[]> {
      const payload: V3Body = { collection, groups: opts.groups };
      if (opts.limit != null) payload.limit = opts.limit;
      if (opts.offset != null) payload.offset = opts.offset;
      return v3Post<V3Document[]>('read', payload);
    },
    async readById(docId: string, collection: string): Promise<V3Document> {
      return v3Post<V3Document>('read-by-id', { doc_id: docId, collection });
    },
    async update(docId: string, body: Record<string, unknown>, opts?: { groups?: string[] }): Promise<V3Document> {
      const payload: V3Body = { doc_id: docId, body };
      if (opts?.groups) payload.groups = opts.groups;
      return v3Post<V3Document>('update', payload);
    },
    async delete(docId: string): Promise<{ doc_id: string; status: string }> {
      return v3Post<{ doc_id: string; status: string }>('delete', { doc_id: docId });
    },

    async addAppContract(allowedOrigin: string, permissions: Record<string, string[]>): Promise<unknown> {
      return v3Post('app-contracts/add', { allowed_origin: allowedOrigin, permissions });
    },
    async listAppContracts(): Promise<unknown[]> {
      return v3Post('app-contracts/list', {});
    },
    async revokeAppContract(allowedOrigin?: string): Promise<{ status: string }> {
      const payload: V3Body = {};
      if (allowedOrigin) payload.allowed_origin = allowedOrigin;
      return v3Post<{ status: string }>('app-contracts/revoke', payload);
    },

    async createGroup(name: string, joinPolicy: string, roles: Record<string, unknown>[], members: { member_key: string; role?: string }[], defaultRole?: string): Promise<{ group_id: string }> {
      return v3Post<{ group_id: string }>('groups/create', { name, join_policy: joinPolicy, roles, members, default_role: defaultRole });
    },
    async getGroup(groupId: string): Promise<V3Group> {
      return v3Post<V3Group>('groups/get', { group_id: groupId });
    },
    async getMyGroups(): Promise<V3Group[]> {
      return v3Post<V3Group[]>('groups/list', {});
    },
    async getGroupsManages(): Promise<V3Group[]> {
      return v3Post<V3Group[]>('groups/manages', {});
    },
    async updateGroup(groupId: string, opts?: { join_policy?: string; roles?: Record<string, unknown>[] }): Promise<V3Group> {
      const payload: V3Body = { group_id: groupId };
      if (opts?.join_policy) payload.join_policy = opts.join_policy;
      if (opts?.roles) payload.roles = opts.roles;
      return v3Post<V3Group>('groups/update', payload);
    },
    async joinGroup(groupId: string): Promise<V3GroupMember | { group_id: string; status: string }> {
      return v3Post<V3GroupMember | { group_id: string; status: string }>('groups/join', { group_id: groupId });
    },
    async requestJoin(groupId: string): Promise<{ group_id: string; status: string }> {
      return v3Post<{ group_id: string; status: string }>('groups/join', { group_id: groupId });
    },
    async leaveGroup(groupId: string): Promise<V3GroupMember> {
      return v3Post<V3GroupMember>('groups/leave', { group_id: groupId });
    },
    async getGroupMembers(groupId: string): Promise<V3GroupMember[]> {
      return v3Post<V3GroupMember[]>('groups/members/list', { group_id: groupId });
    },
    async addGroupMember(groupId: string, memberKey: string, role: string): Promise<V3GroupMember> {
      return v3Post<V3GroupMember>('groups/members/add', { group_id: groupId, member_key: memberKey, role });
    },
    async removeGroupMember(groupId: string, memberKey: string): Promise<V3GroupMember> {
      return v3Post<V3GroupMember>('groups/members/remove', { group_id: groupId, member_key: memberKey });
    },
    async inviteMember(groupId: string, memberKey: string, role: string): Promise<{ group_id: string; invited_key: string; status: string }> {
      return v3Post('groups/invite', { group_id: groupId, member_key: memberKey, role });
    },
    async acceptInvite(groupId: string): Promise<V3GroupMember> {
      return v3Post<V3GroupMember>('groups/accept-invite', { group_id: groupId });
    },
    async declineInvite(groupId: string): Promise<{ group_id: string; status: string }> {
      return v3Post<{ group_id: string; status: string }>('groups/decline-invite', { group_id: groupId });
    },

    async getJoinRequests(groupId: string): Promise<{ requester_key: string; status: string; requested_at: string }[]> {
      return v3Post('groups/requests/join/list', { group_id: groupId });
    },
    async approveJoinRequest(groupId: string, requesterKey: string): Promise<{ group_id: string; requester_key: string; status: string }> {
      return v3Post('groups/requests/join/approve', { group_id: groupId, requester_key: requesterKey });
    },
    async denyJoinRequest(groupId: string, requesterKey: string): Promise<{ group_id: string; requester_key: string; status: string }> {
      return v3Post('groups/requests/join/deny', { group_id: groupId, requester_key: requesterKey });
    },

    async blockUser(blockedKey: string): Promise<{ user_key: string; blocked_key: string }> {
      return v3Post('block', { blocked_key: blockedKey });
    },
    async unblockUser(blockedKey: string): Promise<{ user_key: string; blocked_key: string }> {
      return v3Post('unblock', { blocked_key: blockedKey });
    },
    async blockUserInGroup(blockedKey: string, groupId: string): Promise<{ user_key: string; group_id: string; blocked_key: string }> {
      return v3Post('groups/block', { blocked_key: blockedKey, group_id: groupId });
    },
    async unblockUserInGroup(blockedKey: string, groupId: string): Promise<{ user_key: string; group_id: string; blocked_key: string }> {
      return v3Post('groups/unblock', { blocked_key: blockedKey, group_id: groupId });
    },

    async setSharing(groupId: string, enabled: boolean): Promise<{ user_key: string; group_id: string; sharing_enabled: boolean }> {
      return v3Post('groups/sharing/set', { group_id: groupId, enabled });
    },

    async confirmMediaUpload(metadata: Record<string, unknown>): Promise<V3Document> {
      return v3Post<V3Document>('media/confirm', { body: metadata });
    },
    async listMedia(opts?: { limit?: number; offset?: number }): Promise<V3Document[]> {
      const payload: V3Body = {};
      if (opts?.limit != null) payload.limit = opts.limit;
      if (opts?.offset != null) payload.offset = opts.offset;
      return v3Post<V3Document[]>('media/list', payload);
    },
    async deleteMedia(docId: string): Promise<{ doc_id: string; status: string }> {
      return v3Post<{ doc_id: string; status: string }>('media/delete', { doc_id: docId });
    },

    async getNodeStats(): Promise<{ users: number; documents: number; groups: number }> {
      return v3Post('stats', {});
    },
    async registerApp(app: { url: string; name?: string; description?: string; icon_url?: string; screenshots?: unknown[] }): Promise<{ url: string; review_state: string }> {
      return v3Post('apps/register', { body: app });
    },
    async getApps(): Promise<unknown[]> {
      return v3Post('apps/list', {});
    },
    async rateApp(appId: string, rating: number): Promise<unknown> {
      if (!rating || rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');
      return v3Post('apps/rating', { body: { target_app_id: appId, rating } });
    },
    async getAppRatings(appId: string): Promise<unknown[]> {
      return v3Post('apps/ratings', { body: { target_app_id: appId } });
    },
  };
}

// ── V3 client singleton ─────────────────────────────────────────────────────

let v3Client: V3Client | null = null;

export function getV3Client(): V3Client {
  if (!v3Client) {
    v3Client = createV3ClientFactory(API_ORIGIN);
  }
  return v3Client;
}

export function resetV3Client(): void {
  v3Client = null;
}