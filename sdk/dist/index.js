// src/http.ts
class Web10Error extends Error {
  status;
  details;
  constructor(message, status, details) {
    super(message);
    this.name = "Web10Error";
    this.status = status;
    this.details = details;
  }
}
async function authPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Web10Error(`Request failed: ${res.status} ${res.statusText}`, res.status, text);
  }
  return res.json();
}

// src/token.ts
function cookieDict() {
  if (typeof document === "undefined")
    return {};
  return document.cookie.split(";").reduce((res, c) => {
    const eq = c.indexOf("=");
    if (eq === -1)
      return res;
    const key = c.substring(0, eq).trim();
    const val = c.substring(eq + 1).trim();
    try {
      res[key] = JSON.parse(decodeURIComponent(val));
    } catch {
      res[key] = decodeURIComponent(val);
    }
    return res;
  }, {});
}
function readTokenCookie() {
  const cookies = cookieDict();
  const raw = cookies["token"];
  if (!raw)
    return null;
  try {
    return typeof raw === "string" ? raw : String(raw);
  } catch {
    return null;
  }
}
function setTokenCookie(token, maxAgeDays = 60) {
  if (typeof document === "undefined")
    return;
  const age = 3600 * 24 * maxAgeDays;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "Secure;" : "";
  document.cookie = `token=${token};${secure}path=/;max-age=${age};SameSite=Lax;`;
}
function scrubTokenCookie() {
  if (typeof document === "undefined")
    return;
  document.cookie = "token=;max-age=-1;path=/;";
}
function decodeJwt(token) {
  if (!token)
    return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2)
      return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}
function isTokenExpired(token) {
  const payload = decodeJwt(token);
  if (!payload || !payload.expires)
    return false;
  const expiresMs = Date.parse(payload.expires);
  if (Number.isNaN(expiresMs))
    return false;
  return Date.now() >= expiresMs;
}

// src/v3.ts
function createV3Client(options = {}) {
  const apiOrigin = options.apiOrigin ?? "https://api.web10.app";
  const rtcServer = options.rtcServer ?? "rtc.web10.app";
  const state = {
    apiOrigin,
    token: options.token ?? readTokenCookie(),
    rtcServer
  };
  async function v3Post(action, body) {
    const token = state.token ?? readTokenCookie();
    if (!token) {
      throw new Web10Error("No token available. Call login() or setToken() first.", 401);
    }
    return authPost(`${apiOrigin}/v3/${action}`, { ...body, token });
  }
  function pingAppRegister() {
    if (typeof window === "undefined" || typeof window.location?.href !== "string")
      return;
    try {
      const token = state.token ?? readTokenCookie();
      const rawUrl = window.location.href.split(/[?#]/)[0];
      const url = rawUrl.replace(/\/index\.html$/, "/");
      const body = { url };
      if (token)
        body.token = token;
      fetch(`${apiOrigin}/v3/apps/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body })
      }).catch(() => {});
    } catch {}
  }
  const client = {
    get state() {
      return { ...state };
    },
    setToken(token) {
      state.token = token;
      setTokenCookie(token);
      pingAppRegister();
    },
    scrubToken() {
      state.token = null;
      scrubTokenCookie();
    },
    readToken() {
      const current = readTokenCookie() ?? state.token;
      return current ? decodeJwt(current) : null;
    },
    isSignedIn() {
      const current = readTokenCookie() ?? state.token;
      return current != null && current !== "";
    },
    signOut() {
      this.scrubToken();
    },
    async login(username, password, site) {
      const res = await authPost(`${apiOrigin}/v3/login`, { username, password, site: site ?? window?.location?.hostname ?? "web10" });
      this.setToken(res.token);
      return res;
    },
    async signup(username, password, phone, email) {
      return authPost(`${apiOrigin}/v3/signup`, { username, password, phone, email });
    },
    async getProfile() {
      return v3Post("profile", {});
    },
    async verifySession(options2 = {}) {
      const body = {};
      if (options2.services?.length)
        body.services = options2.services;
      if (options2.operations?.length)
        body.operations = options2.operations;
      return v3Post("session/verify", body);
    },
    async changePassword(currentPassword, newPassword) {
      return v3Post("change-pass", { password: currentPassword, new_pass: newPassword });
    },
    async changePhone(phone) {
      return v3Post("change-phone", { phone });
    },
    async setEmail(email) {
      return v3Post("set-email", { email });
    },
    async verifyPhone(code) {
      return v3Post("verify-phone", { code });
    },
    async verifyEmail(code) {
      return v3Post("verify-email", { code });
    },
    async sendCode() {
      return v3Post("send_code", {});
    },
    async setRecoveryPhone(phone) {
      return v3Post("set_recovery_phone", { query: { phone } });
    },
    async create(collection, body, opts) {
      const payload = { service: collection, body };
      if (opts?.groups)
        payload.groups = opts.groups;
      if (opts?.ad_preference)
        payload.ad_preference = opts.ad_preference;
      return v3Post("create", payload);
    },
    async read(collection, opts) {
      const payload = { service: collection, groups: opts.groups };
      if (opts.limit != null)
        payload.limit = opts.limit;
      if (opts.offset != null)
        payload.offset = opts.offset;
      return v3Post("read", payload);
    },
    async readById(docId, collection) {
      return v3Post("read", { doc_id: docId, service: collection });
    },
    async update(docId, body, opts) {
      const payload = { doc_id: docId, body };
      if (opts?.groups)
        payload.groups = opts.groups;
      if (opts?.ad_preference)
        payload.ad_preference = opts.ad_preference;
      return v3Post("update", payload);
    },
    async delete(docId) {
      return v3Post("delete", { doc_id: docId });
    },
    async addAppContract(allowedOrigin, permissions) {
      return v3Post("app-contracts/add", {
        allowed_origin: allowedOrigin,
        permissions
      });
    },
    async listAppContracts() {
      return v3Post("app-contracts/list", {});
    },
    async revokeAppContract(allowedOrigin) {
      const payload = {};
      if (allowedOrigin)
        payload.allowed_origin = allowedOrigin;
      return v3Post("app-contracts/revoke", payload);
    },
    async createGroup(name, joinPolicy, roles, members) {
      return v3Post("groups/create", {
        name,
        join_policy: joinPolicy,
        roles,
        members
      });
    },
    async getGroup(groupId) {
      return v3Post("groups/get", { group_id: groupId });
    },
    async getMyGroups() {
      return v3Post("groups/list", {});
    },
    async getGroupsManages() {
      return v3Post("groups/manages", {});
    },
    async updateGroup(groupId, opts) {
      const payload = { group_id: groupId };
      if (opts?.join_policy)
        payload.join_policy = opts.join_policy;
      if (opts?.roles)
        payload.roles = opts.roles;
      return v3Post("groups/update", payload);
    },
    async joinGroup(groupId) {
      return v3Post("groups/join", { group_id: groupId });
    },
    async requestJoin(groupId) {
      return v3Post("groups/join", { group_id: groupId });
    },
    async leaveGroup(groupId) {
      return v3Post("groups/leave", { group_id: groupId });
    },
    async getGroupMembers(groupId) {
      return v3Post("groups/members/list", { group_id: groupId });
    },
    async addGroupMember(groupId, memberKey, role) {
      return v3Post("groups/members/add", {
        group_id: groupId,
        member_key: memberKey,
        role
      });
    },
    async removeGroupMember(groupId, memberKey) {
      return v3Post("groups/members/remove", {
        group_id: groupId,
        member_key: memberKey
      });
    },
    async inviteMember(groupId, memberKey, role) {
      return v3Post("groups/invite", {
        group_id: groupId,
        member_key: memberKey,
        role
      });
    },
    async acceptInvite(groupId) {
      return v3Post("groups/accept-invite", { group_id: groupId });
    },
    async declineInvite(groupId) {
      return v3Post("groups/decline-invite", { group_id: groupId });
    },
    async getJoinRequests(groupId) {
      return v3Post("groups/requests/join/list", { group_id: groupId });
    },
    async approveJoinRequest(groupId, requesterKey) {
      return v3Post("groups/requests/join/approve", {
        group_id: groupId,
        requester_key: requesterKey
      });
    },
    async denyJoinRequest(groupId, requesterKey) {
      return v3Post("groups/requests/join/deny", {
        group_id: groupId,
        requester_key: requesterKey
      });
    },
    async blockUser(blockedKey) {
      return v3Post("block", { blocked_key: blockedKey });
    },
    async unblockUser(blockedKey) {
      return v3Post("unblock", { blocked_key: blockedKey });
    },
    async blockUserInGroup(blockedKey, groupId) {
      return v3Post("groups/block", {
        blocked_key: blockedKey,
        group_id: groupId
      });
    },
    async unblockUserInGroup(blockedKey, groupId) {
      return v3Post("groups/unblock", {
        blocked_key: blockedKey,
        group_id: groupId
      });
    },
    async setSharing(groupId, enabled) {
      return v3Post("groups/sharing/set", {
        group_id: groupId,
        enabled
      });
    },
    async requestMediaUploadUrl(params) {
      return v3Post("media/upload-url", {
        body: {
          filename: params.filename,
          mime_type: params.mimeType ?? "application/octet-stream",
          size_bytes: params.sizeBytes ?? null
        }
      });
    },
    async getMediaReadUrl(objectKey) {
      return v3Post("media/read-url", { body: { object_key: objectKey } });
    },
    async confirmMediaUpload(metadata) {
      return v3Post("media/confirm", { body: metadata });
    },
    async listMedia(opts) {
      const payload = {};
      if (opts?.limit != null)
        payload.limit = opts.limit;
      if (opts?.offset != null)
        payload.offset = opts.offset;
      if (opts?.doc_ids?.length)
        payload.doc_ids = opts.doc_ids;
      return v3Post("media/list", payload);
    },
    async deleteMedia(docId) {
      return v3Post("media/delete", { doc_id: docId });
    },
    async getNodeStats() {
      return v3Post("stats", {});
    },
    async registerApp(app) {
      return authPost(`${apiOrigin}/v3/apps/register`, { body: app });
    },
    async getApps() {
      return v3Post("apps/list", {});
    },
    async rateApp(appId, rating) {
      if (!rating || rating < 1 || rating > 5) {
        throw new Web10Error("Rating must be between 1 and 5", 400);
      }
      return v3Post("apps/rating", { body: { target_app_id: appId, rating } });
    },
    async getAppRatings(appId) {
      return v3Post("apps/ratings", { body: { target_app_id: appId } });
    },
    contractRequest(contracts, authOrigin, callback) {
      if (typeof window === "undefined") {
        if (callback)
          callback({ status: "error", errors: ["Not in a browser"] });
        return;
      }
      const popup = window.open(`${authOrigin}`, "web10-consent", "width=480,height=720,scrollbars=yes");
      if (!popup) {
        if (callback)
          callback({ status: "error", errors: ["Popup blocked — allow popups and try again"] });
        return;
      }
      const responseHandler = (e) => {
        if (e.data?.type === "contract_response") {
          window.removeEventListener("message", responseHandler);
          window.removeEventListener("message", readyHandler);
          clearTimeout(timeoutId);
          callback?.(e.data);
        }
      };
      window.addEventListener("message", responseHandler);
      const readyHandler = (e) => {
        if (e.data?.type === "auth_ready") {
          window.removeEventListener("message", readyHandler);
          try {
            popup.postMessage({ type: "contract", contracts }, authOrigin);
          } catch {
            window.removeEventListener("message", responseHandler);
            clearTimeout(timeoutId);
            callback?.({ status: "error", errors: ["Failed to send contract request to auth UI"] });
          }
        }
      };
      window.addEventListener("message", readyHandler);
      const timeoutId = setTimeout(() => {
        window.removeEventListener("message", responseHandler);
        window.removeEventListener("message", readyHandler);
        callback?.({ status: "error", errors: ["Auth popup closed — request cancelled"] });
      }, 30000);
    },
    contractOnReady(contracts, callback) {
      if (typeof window === "undefined" || !window.opener) {
        if (callback)
          callback({ status: "error", errors: ["No opener window — not in a popup"] });
        return;
      }
      if (callback) {
        const handler = (e) => {
          if (e.data?.type === "contract_response") {
            window.removeEventListener("message", handler);
            callback(e.data);
          }
        };
        window.addEventListener("message", handler);
      }
      window.opener.postMessage({ type: "contract", contracts }, "*");
    }
  };
  pingAppRegister();
  return client;
}
export {
  setTokenCookie,
  scrubTokenCookie,
  readTokenCookie,
  isTokenExpired,
  decodeJwt,
  createV3Client,
  cookieDict,
  Web10Error
};
