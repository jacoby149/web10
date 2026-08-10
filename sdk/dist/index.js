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

// src/http.ts
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Web10Error(`Request failed: ${res.status} ${res.statusText}`, res.status, text);
  }
  return res.json();
}

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
async function patch(url, body) {
  return request("PATCH", url, body);
}
async function post(url, body) {
  return request("POST", url, body);
}
async function put(url, body) {
  return request("PUT", url, body);
}
async function del(url, body) {
  return request("DELETE", url, body);
}
async function aggregate(url, body) {
  return request("POST", url, body);
}
async function authPost(url, body) {
  return request("POST", url, body);
}

// src/client.ts
function createClient(options = {}) {
  const authUrl = options.authUrl ?? "https://auth.web10.app";
  const protocol = new URL(authUrl).protocol;
  const apiOrigin = options.apiOrigin ?? `${protocol}//api.web10.app`;
  const authOrigin = new URL(authUrl).origin;
  const rtcServer = options.rtcServer ?? "rtc.web10.app";
  const appStores = options.appStores ?? ["https://api.web10.app"];
  const state = {
    apiOrigin,
    authUrl,
    token: readTokenCookie(),
    rtcServer,
    appStores
  };
  const readUrlCache = new Map;
  const READ_URL_MARGIN_MS = 5000;
  const client = {
    get state() {
      return { ...state };
    },
    setToken(token) {
      state.token = token;
      setTokenCookie(token);
    },
    scrubToken() {
      state.token = null;
      scrubTokenCookie();
    },
    readToken() {
      return decodeJwt(state.token);
    },
    isSignedIn() {
      return state.token != null && state.token !== "";
    },
    signOut() {
      this.scrubToken();
    },
    openAuthPortal() {
      if (typeof window === "undefined")
        return null;
      return window.open(state.authUrl, "_blank");
    },
    login() {
      return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
          reject(new Error("login() requires a browser environment"));
          return;
        }
        this.openAuthPortal();
        const handler = (e) => {
          if (e.origin !== authOrigin)
            return;
          if (e.data?.type === "auth") {
            if (e.data.token) {
              this.setToken(e.data.token);
            } else {
              this.scrubToken();
            }
            window.removeEventListener("message", handler);
            resolve();
          }
        };
        window.addEventListener("message", handler);
        setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("Login timed out"));
        }, 5 * 60 * 1000);
      });
    },
    authListen(setAuth) {
      if (typeof window === "undefined")
        return;
      window.addEventListener("message", (e) => {
        if (e.origin !== authOrigin)
          return;
        if (e.data?.type === "auth") {
          if (e.data.token) {
            this.setToken(e.data.token);
          } else {
            this.scrubToken();
          }
          setAuth(this.isSignedIn());
        }
      });
    },
    read(service, query, username, provider) {
      guardAuth(state, username);
      const u = resolveUsername(state, username);
      const base = originFor(state, provider);
      return patch(`${base}/${u}/${service}`, { token: state.token, query: query ?? null, update: null });
    },
    create(service, body, username, provider) {
      guardAuth(state, username);
      const u = resolveUsername(state, username);
      const base = originFor(state, provider);
      return post(`${base}/${u}/${service}`, { token: state.token, query: body ?? null, update: null });
    },
    update(service, query, update, username, provider) {
      guardAuth(state, username);
      const u = resolveUsername(state, username);
      const base = originFor(state, provider);
      return put(`${base}/${u}/${service}`, { token: state.token, query: query ?? null, update: update ?? null });
    },
    deleteRecord(service, query, username, provider) {
      guardAuth(state, username);
      const u = resolveUsername(state, username);
      const base = originFor(state, provider);
      return del(`${base}/${u}/${service}`, { token: state.token, query: query ?? null, update: null });
    },
    aggregate(service, pipeline = [], username, provider) {
      guardAuth(state, username);
      const u = resolveUsername(state, username);
      const base = originFor(state, provider);
      return aggregate(`${base}/${u}/${service}/aggregate`, { token: state.token, pipeline });
    },
    getTieredToken(site, target) {
      const token = this.readToken();
      if (!token)
        throw new Error("No token available for tiered mint");
      return authPost(`${apiOrigin}/web10token`, {
        username: token.username,
        password: null,
        token: state.token,
        site,
        target
      });
    },
    contractOnReady(contracts) {
      if (typeof window === "undefined")
        return;
      window.addEventListener("message", (e) => {
        if (e.origin !== authOrigin)
          return;
        if (e.data?.type === "ContractListen" && e.source instanceof Window) {
          e.source.postMessage({ type: "contract", contracts }, authOrigin);
        }
      });
    },
    contractResponseListen(setStatus) {
      if (typeof window === "undefined")
        return;
      window.addEventListener("message", (e) => {
        if (e.origin !== authOrigin)
          return;
        if (e.data?.type === "status") {
          setStatus(e.data.status);
        }
      });
    },
    acrOnReady(acrs) {
      if (typeof window === "undefined")
        return;
      window.addEventListener("message", (e) => {
        if (e.origin !== authOrigin)
          return;
        if (e.data?.type === "ACRListen" && e.source instanceof Window) {
          e.source.postMessage({ type: "acr", acrs }, authOrigin);
        }
      });
    },
    acrResponseListen(setStatus) {
      if (typeof window === "undefined")
        return;
      window.addEventListener("message", (e) => {
        if (e.origin !== authOrigin)
          return;
        if (e.data?.type === "acr-status") {
          setStatus(e.data.status);
        }
      });
    },
    requestUploadUrl(params, username, provider) {
      guardAuth(state, username);
      const u = resolveUsername(state, username);
      const base = originFor(state, provider);
      return authPost(`${base}/${u}/upload`, {
        token: state.token,
        filename: params.filename,
        mime_type: params.mimeType ?? null,
        size_bytes: params.sizeBytes ?? null
      });
    },
    confirmUpload(params, username, provider) {
      guardAuth(state, username);
      const u = resolveUsername(state, username);
      const base = originFor(state, provider);
      return authPost(`${base}/${u}/upload/confirm`, {
        token: state.token,
        url: params.url,
        filename: params.filename,
        mime_type: params.mimeType ?? null,
        size_bytes: params.sizeBytes ?? null,
        width: params.width ?? null,
        height: params.height ?? null,
        duration_seconds: params.durationSeconds ?? null,
        thumbnail_url: params.thumbnailUrl ?? null,
        caption: params.caption ?? null,
        alt_text: params.altText ?? null,
        origin: params.origin ?? null,
        origin_id: params.originId ?? null,
        encrypted: params.encrypted ?? false
      });
    },
    async upload(file, meta = {}, username, provider) {
      guardAuth(state, username);
      const filename = meta.filename ?? file.name ?? "upload";
      const mimeType = meta.mimeType ?? file.type ?? "application/octet-stream";
      const presigned = await this.requestUploadUrl({ filename, mimeType, sizeBytes: file.size }, username, provider);
      const form = new FormData;
      for (const [k, v] of Object.entries(presigned.fields)) {
        form.append(k, v);
      }
      form.append("file", file, filename);
      const s3Res = await fetch(presigned.upload_url, {
        method: "POST",
        body: form
      });
      if (!s3Res.ok) {
        const text = await s3Res.text().catch(() => "");
        throw new Web10Error(`media upload to object storage failed: ${s3Res.status} ${s3Res.statusText}`, s3Res.status, text);
      }
      return this.confirmUpload({
        url: presigned.upload_url,
        filename,
        mimeType,
        sizeBytes: file.size,
        width: meta.width,
        height: meta.height,
        durationSeconds: meta.durationSeconds,
        thumbnailUrl: meta.thumbnailUrl,
        caption: meta.caption,
        altText: meta.altText
      }, username, provider);
    },
    async getReadUrl(objectKey, opts) {
      const username = opts?.username ?? null;
      const provider = opts?.provider ?? null;
      guardAuth(state, username);
      const u = resolveUsername(state, username);
      const base = originFor(state, provider);
      const cacheKey = `${base}/${u}/${objectKey}`;
      const now = Date.now();
      const cached = readUrlCache.get(cacheKey);
      if (!opts?.force && cached && cached.staleAt > now + READ_URL_MARGIN_MS) {
        return cached.url;
      }
      const res = await authPost(`${base}/${u}/read`, {
        token: state.token,
        object_key: objectKey
      });
      readUrlCache.set(cacheKey, {
        url: res.read_url,
        staleAt: now + res.expires_in * 1000
      });
      return res.read_url;
    },
    checkout(params) {
      const token = this.readToken();
      if (!token)
        throw new Error("Must be signed in for checkout");
      return authPost(`${apiOrigin}/dev_pay`, {
        token: state.token,
        seller: params.seller,
        title: params.title,
        price: params.price,
        success_url: params.success_url,
        cancel_url: params.cancel_url
      }).then((res) => {
        if (typeof window !== "undefined") {
          window.location.href = res.url;
        }
      });
    },
    verifySubscription(params) {
      const token = this.readToken();
      if (!token)
        throw new Error("Must be signed in");
      return authPost(`${apiOrigin}/dev_pay`, {
        token: state.token,
        seller: params.seller,
        title: params.title,
        price: null
      });
    },
    cancelSubscription(params) {
      const token = this.readToken();
      if (!token)
        throw new Error("Must be signed in");
      return authPost(`${apiOrigin}/dev_pay`, {
        token: state.token,
        seller: params.seller,
        title: params.title
      });
    }
  };
  if (typeof window !== "undefined" && typeof window.location !== "undefined" && typeof window.location.href === "string") {
    for (const appStore of appStores) {
      try {
        fetch(`${appStore}/register_app`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: window.location.href.split("?")[0] })
        }).catch(() => {});
      } catch {}
    }
  }
  return client;
}
function guardAuth(state, username) {
  if (!username && !state.token || username === "anon") {
    throw new Error("Cannot perform CRUD without authentication");
  }
  if (!state.token) {
    throw new Error("No token available. Call login() or setToken() first.");
  }
}
function originFor(state, provider) {
  if (!provider)
    return state.apiOrigin;
  const protocol = new URL(state.apiOrigin).protocol;
  return `${protocol}//${provider}`;
}
function resolveUsername(state, username) {
  if (username)
    return username;
  const token = decodeJwt(state.token);
  if (!token?.username)
    throw new Error("No username in token");
  return token.username;
}
// src/auth.ts
function createAuthConnector(wapi) {
  let oAuthToken = null;
  const api = () => {
    return wapi.state.apiOrigin;
  };
  const openerOrigin = () => {
    if (typeof document === "undefined" || !document.referrer)
      return null;
    try {
      return new URL(document.referrer).origin;
    } catch {
      return null;
    }
  };
  const connector = {
    get oAuthToken() {
      return oAuthToken;
    },
    async mintOAuthToken() {
      const tokenData = wapi.readToken();
      if (!tokenData) {
        oAuthToken = null;
        return null;
      }
      if (typeof document === "undefined" || !document.referrer) {
        oAuthToken = null;
        return null;
      }
      try {
        const referrerURL = new URL(document.referrer);
        const res = await wapi.getTieredToken(referrerURL.hostname, tokenData.provider);
        oAuthToken = res.token;
        return oAuthToken;
      } catch (err) {
        console.error("web10: minting a token for the referrer app failed", err);
        oAuthToken = null;
        return null;
      }
    },
    sendToken() {
      if (typeof window === "undefined" || !window.opener)
        return;
      const target = openerOrigin();
      if (!target)
        return;
      window.opener.postMessage({ type: "auth", token: oAuthToken }, target);
      window.close();
    },
    async logIn(params) {
      const hostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const res = await authPost(`${api()}/web10token`, {
        username: params.username,
        password: params.password,
        token: null,
        site: hostname,
        target: null
      });
      wapi.setToken(res.token);
      await this.mintOAuthToken();
    },
    async signUp(params) {
      await authPost(`${api()}/signup`, {
        username: params.username,
        password: params.password,
        betacode: params.betacode ?? null,
        phone: params.phone ?? null
      });
    },
    contractListen(setState) {
      if (typeof window === "undefined" || !window.opener)
        return;
      const target = openerOrigin();
      if (!target)
        return;
      window.addEventListener("message", (e) => {
        if (e.origin !== target)
          return;
        if (e.data?.type === "contract") {
          setState(e.data);
        }
      });
      window.opener.postMessage({ type: "ContractListen" }, target);
    },
    acrListen(setState) {
      if (typeof window === "undefined" || !window.opener)
        return;
      const target = openerOrigin();
      if (!target)
        return;
      window.addEventListener("message", (e) => {
        if (e.origin !== target)
          return;
        if (e.data?.type === "acr") {
          setState(e.data);
        }
      });
      window.opener.postMessage({ type: "ACRListen" }, target);
    },
    async changePassword(currentPassword, newPassword) {
      const token = wapi.readToken();
      if (!token)
        throw new Error("Not authenticated");
      await authPost(`${api()}/change_pass`, { username: token.username, password: currentPassword, new_pass: newPassword });
    },
    async changePhone(password, phone) {
      const token = wapi.readToken();
      if (!token)
        throw new Error("Not authenticated");
      await authPost(`${api()}/change_phone`, { username: token.username, password, phone });
    },
    async sendCode() {
      await authPost(`${api()}/send_code`, { token: wapi.state.token });
    },
    async verifyCode(code) {
      await authPost(`${api()}/verify_code`, { token: wapi.state.token, query: { code } });
    },
    async manageSpace() {
      return authPost(`${api()}/manage_space`, { token: wapi.state.token });
    },
    async manageCredits() {
      return authPost(`${api()}/manage_credits`, { token: wapi.state.token });
    },
    async manageBusiness() {
      return authPost(`${api()}/manage_business`, { token: wapi.state.token });
    },
    async manageSubscriptions() {
      return authPost(`${api()}/manage_subscriptions`, { token: wapi.state.token });
    },
    async businessLogin() {
      return authPost(`${api()}/business_login`, { token: wapi.state.token });
    },
    async getPlan() {
      return authPost(`${api()}/get_plan`, { token: wapi.state.token });
    }
  };
  if (wapi.isSignedIn() && typeof document !== "undefined" && document.referrer) {
    connector.mintOAuthToken().catch(() => {});
  }
  return connector;
}
// src/v3.ts
function createV3Client(options = {}) {
  const apiOrigin = options.apiOrigin ?? "https://api.web10.app";
  const state = {
    apiOrigin,
    token: options.token ?? readTokenCookie()
  };
  async function v3Post(action, body) {
    if (!state.token) {
      throw new Web10Error("No token available. Call login() or setToken() first.", 401);
    }
    return authPost(`${apiOrigin}/v3/${action}`, { ...body, token: state.token });
  }
  const client = {
    get state() {
      return { ...state };
    },
    setToken(token) {
      state.token = token;
      setTokenCookie(token);
    },
    scrubToken() {
      state.token = null;
      scrubTokenCookie();
    },
    readToken() {
      return decodeJwt(state.token);
    },
    isSignedIn() {
      return state.token != null && state.token !== "";
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
      const payload = { collection, body };
      if (opts?.groups)
        payload.groups = opts.groups;
      return v3Post("create", payload);
    },
    async read(collection, opts) {
      const payload = { collection, groups: opts.groups };
      if (opts.limit != null)
        payload.limit = opts.limit;
      if (opts.offset != null)
        payload.offset = opts.offset;
      return v3Post("read", payload);
    },
    async readById(docId, collection) {
      return v3Post("read-by-id", { doc_id: docId, collection });
    },
    async update(docId, body, opts) {
      const payload = { doc_id: docId, body };
      if (opts?.groups)
        payload.groups = opts.groups;
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
      return v3Post("block-in-group", {
        blocked_key: blockedKey,
        group_id: groupId
      });
    },
    async unblockUserInGroup(blockedKey, groupId) {
      return v3Post("unblock-in-group", {
        blocked_key: blockedKey,
        group_id: groupId
      });
    },
    async setSharing(groupId, enabled) {
      return v3Post("sharing/set", {
        group_id: groupId,
        enabled
      });
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
      return v3Post("media/list", payload);
    },
    async deleteMedia(docId) {
      return v3Post("media/delete", { doc_id: docId });
    },
    async getNodeStats() {
      return v3Post("stats", {});
    },
    async registerApp(app) {
      return v3Post("apps/register", { body: app });
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
    }
  };
  return client;
}
// src/compat.ts
var PeerCtor = null;
if (typeof window !== "undefined" && typeof window.Peer !== "undefined") {
  PeerCtor = window.Peer;
}
function wapiInit(authUrl = "https://auth.web10.app", appStores = ["https://api.web10.app"], rtcServer = "rtc.web10.app") {
  const protocol = new URL(authUrl).protocol;
  const apiOrigin = appStores[0] ?? `${protocol}//api.web10.app`;
  const client = createClient({ authUrl, apiOrigin, rtcServer, appStores });
  let childWindow = null;
  const outBound = {};
  const inBound = {};
  const wapi = {
    APIProtocol: protocol,
    childWindow: null,
    get token() {
      return client.state.token;
    },
    setToken: (t) => {
      client.setToken(t);
    },
    scrubToken: () => {
      client.scrubToken();
    },
    isSignedIn: () => client.isSignedIn(),
    signOut: () => client.signOut(),
    readToken: () => client.readToken(),
    openAuthPortal: () => {
      childWindow = client.openAuthPortal();
      wapi.childWindow = childWindow;
      return childWindow;
    },
    authListen: (setAuth) => {
      client.authListen(setAuth);
    },
    read: (service, query, username, provider) => client.read(service, query, username, provider),
    create: (service, body, username, provider) => client.create(service, body, username, provider),
    update: (service, query, update, username, provider) => client.update(service, query, update, username, provider),
    delete: (service, query, username, provider) => client.deleteRecord(service, query, username, provider),
    aggregate: (service, pipeline = [], username, provider) => client.aggregate(service, pipeline, username, provider),
    getTieredToken: (site, target) => client.getTieredToken(site, target),
    ContractOnReady: (contracts) => {
      if (typeof window === "undefined")
        return;
      const authOrigin = new URL(authUrl).origin;
      window.addEventListener("message", (e) => {
        if (e.origin !== authOrigin)
          return;
        if (e.data?.type === "ContractListen" && childWindow) {
          childWindow.postMessage({ type: "contract", contracts }, authOrigin);
        }
      });
    },
    ContractResponseListen: (setStatus) => {
      client.contractResponseListen(setStatus);
    },
    peer: null,
    outBound,
    inBound,
    peerID: (provider, user, origin, label = "") => `${provider} ${user} ${origin} ${label}`.replaceAll(".", "_"),
    initP2P: function(onInbound, label = "", secure = true) {
      if (!PeerCtor) {
        throw new Error("PeerJS is not installed. Install peerjs or use the new SDK rtc module.");
      }
      const token = client.readToken();
      if (!token)
        throw new Error("Cannot init P2P without a token");
      const id = this.peerID(token.provider, token.username, token.site, label);
      const peer = new PeerCtor(id, {
        host: rtcServer,
        secure,
        port: secure ? 443 : 80,
        path: "/",
        token: `${client.state.token}~${label}`
      });
      wapi.peer = peer;
      if (onInbound && typeof onInbound === "function") {
        peer.on("connection", (conn) => {
          inBound[conn.peer] = conn;
          conn.on("data", (data) => onInbound(conn, data));
          conn.on("close", () => delete inBound[conn.peer]);
        });
      }
    },
    P2P: function(provider, username, origin, label = "") {
      if (!wapi.peer)
        throw new Error("P2P not initialized");
      const id = this.peerID(provider, username, origin, label);
      if (!outBound[id]) {
        const conn = wapi.peer.connect(id);
        outBound[conn.peer] = conn;
        conn.on("close", () => delete outBound[conn.peer]);
      }
      return outBound[id];
    },
    send: function(provider, username, origin, label, data) {
      const conn = this.P2P(provider, username, origin, label);
      if (conn.open) {
        conn.send(data);
        return { connected: true };
      } else {
        conn.on("open", () => conn.send(data));
        return { connected: false };
      }
    },
    checkout: (seller, title, price, success_url, cancel_url) => client.checkout({ seller, title, price, success_url, cancel_url }),
    verifySubscription: (seller, title) => client.verifySubscription({ seller, title }),
    cancelSubscription: (seller, title) => client.cancelSubscription({ seller, title })
  };
  return wapi;
}
function wapiAuthInit(wapi) {
  const authUrl = `${wapi.APIProtocol}//auth.web10.app`;
  const client = createClient({ authUrl });
  if (typeof wapi.token === "string" && wapi.token) {
    client.setToken(wapi.token);
  }
  const origSetToken = wapi.setToken;
  const origScrubToken = wapi.scrubToken;
  wapi.setToken = (t) => {
    origSetToken(t);
    client.setToken(t);
  };
  wapi.scrubToken = () => {
    origScrubToken();
    client.scrubToken();
  };
  const connector = createAuthConnector(client);
  let oAuthToken = connector.oAuthToken;
  const wapiAuth = {
    get oAuthToken() {
      return oAuthToken;
    },
    mintOAuthToken: async () => {
      oAuthToken = await connector.mintOAuthToken();
      return oAuthToken;
    },
    sendToken: () => {
      connector.sendToken();
    },
    logIn: (provider, username, password) => {
      return connector.logIn({ provider, username, password });
    },
    signUp: (provider, username, password, betacode, phone) => {
      return connector.signUp({ provider, username, password, betacode: betacode ?? undefined, phone: phone ?? undefined });
    },
    contractListen: (setState) => {
      connector.contractListen(setState);
    },
    changePass: (pass, newPass) => connector.changePassword(pass, newPass),
    changePhone: (pass, newPhone) => connector.changePhone(pass, newPhone),
    sendCode: () => connector.sendCode(),
    verifyCode: (code) => connector.verifyCode(code),
    manageSpace: () => connector.manageSpace(),
    manageCredits: () => connector.manageCredits(),
    manageBusiness: () => connector.manageBusiness(),
    manageSubscriptions: () => connector.manageSubscriptions(),
    businessLogin: () => connector.businessLogin(),
    getPlan: () => connector.getPlan()
  };
  if (typeof wapi.isSignedIn === "function" && wapi.isSignedIn() && typeof document !== "undefined" && document.referrer) {
    wapiAuth.mintOAuthToken().catch(() => {});
  }
  return wapiAuth;
}
if (typeof window !== "undefined") {
  window.wapiInit = wapiInit;
  window.wapiAuthInit = wapiAuthInit;
}
export {
  wapiInit,
  wapiAuthInit,
  setTokenCookie,
  scrubTokenCookie,
  readTokenCookie,
  isTokenExpired,
  decodeJwt,
  createV3Client,
  createClient,
  createAuthConnector,
  cookieDict,
  Web10Error
};
