(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  function __accessProp(key) {
    return this[key];
  }
  var __toCommonJS = (from) => {
    var entry = (__moduleCache ??= new WeakMap).get(from), desc;
    if (entry)
      return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if (from && typeof from === "object" || typeof from === "function") {
      for (var key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(entry, key))
          __defProp(entry, key, {
            get: __accessProp.bind(from, key),
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
          });
    }
    __moduleCache.set(from, entry);
    return entry;
  };
  var __moduleCache;
  var __returnValue = (v) => v;
  function __exportSetter(name, newValue) {
    this[name] = __returnValue.bind(null, newValue);
  }
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: __exportSetter.bind(all, name)
      });
  };

  // src/browser.ts
  var exports_browser = {};
  __export(exports_browser, {
    default: () => browser_default
  });

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
        return v3Post("read-by-id", { doc_id: docId, service: collection });
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
    return client;
  }

  // src/browser.ts
  var _authPopup = null;
  var _popupReady = false;
  var _readyListener = null;
  function openAuthPortal(authOrigin, options = {}) {
    const token = readTokenCookie();
    const decoded = token ? decodeJwt(token) : null;
    const as = decoded?.username ? `&as=${encodeURIComponent(decoded.username)}` : "";
    const handoff = options.handoff === "none" ? "&handoff=none" : "";
    const url = `${authOrigin}?redirect=${encodeURIComponent(window.location.href)}${as}${handoff}`;
    console.log("[wapi] openAuthPortal — opening popup:", url, "as:", decoded?.username || "(none)", "handoff:", options.handoff || "token");
    const winName = `web10-auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    _authPopup = window.open(url, winName, "width=480,height=720,scrollbars=yes");
    console.log("[wapi] openAuthPortal — popup returned:", _authPopup ? "open" : "blocked/null");
    _popupReady = false;
    if (_readyListener) {
      window.removeEventListener("message", _readyListener);
      console.log("[wapi] openAuthPortal — removed old auth_ready listener");
    }
    _readyListener = (e) => {
      if (e.data?.type === "auth_ready") {
        console.log("[wapi] message event received — type: auth_ready, source:", e.source, "origin:", e.origin);
        _popupReady = true;
        console.log("[wapi] auth_ready — popup is ready, flag set");
      }
    };
    window.addEventListener("message", _readyListener);
    console.log("[wapi] openAuthPortal — auth_ready listener attached");
    return _authPopup;
  }
  function authListen(onSignedIn) {
    const handler = (e) => {
      if (e.data?.type === "auth" && e.data?.token) {
        const incoming = decodeJwt(e.data.token);
        const current = readTokenCookie();
        const currentDecoded = current ? decodeJwt(current) : null;
        if (currentDecoded?.username && incoming?.username && currentDecoded.username !== incoming.username) {
          console.warn("[wapi] auth event — token user mismatch (current:", currentDecoded.username, ", incoming:", incoming.username, ") — rejecting to prevent identity hijack");
          return;
        }
        console.log("[wapi] auth event received from popup, setting token cookie");
        setTokenCookie(e.data.token);
        onSignedIn(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }
  function createV3Client2(options) {
    const client = createV3Client(options);
    const originalContractRequest = client.contractRequest;
    client.contractRequest = function(contracts, authOrigin, callback) {
      console.log("[wapi] contractRequest — called with", contracts.length, "contract(s):", JSON.stringify(contracts));
      const token = readTokenCookie();
      if (token && !(_authPopup && !_authPopup.closed)) {
        checkExistingContracts(client, contracts, token).then((allExist) => {
          if (allExist) {
            console.log("[wapi] contractRequest — all contracts already exist, skipping popup");
            callback?.({ status: "approved" });
            return;
          }
          doContractRequest();
        }).catch(() => {
          doContractRequest();
        });
        return;
      }
      doContractRequest();
      function doContractRequest() {
        const popup = _authPopup;
        if (popup && !popup.closed) {
          console.log("[wapi] contractRequest — reusing existing popup (not closed)");
          let contractSent = false;
          let readyHandler = null;
          let timeoutId = null;
          const responseHandler = (e) => {
            if (e.data?.type === "contract_response") {
              console.log("[wapi] contract_response received:", e.data);
              window.removeEventListener("message", responseHandler);
              if (readyHandler)
                window.removeEventListener("message", readyHandler);
              if (timeoutId)
                clearTimeout(timeoutId);
              callback?.(e.data);
            }
          };
          window.addEventListener("message", responseHandler);
          console.log("[wapi] contractRequest — contract_response listener attached");
          const sendContract = () => {
            contractSent = true;
            if (readyHandler) {
              const eh = readyHandler;
              window.removeEventListener("message", eh);
            }
            if (timeoutId)
              clearTimeout(timeoutId);
            console.log("[wapi] contractRequest — sending contract to popup");
            try {
              popup.postMessage({ type: "contract", contracts }, "*");
              console.log("[wapi] contractRequest — contract sent via postMessage");
            } catch (err) {
              console.error("[wapi] postMessage to popup failed:", err);
              window.removeEventListener("message", responseHandler);
              callback?.({ status: "error", errors: ["Failed to send contract to auth UI"] });
            }
          };
          if (_popupReady) {
            console.log("[wapi] contractRequest — popup already ready, sending immediately");
            sendContract();
            return;
          }
          readyHandler = (e) => {
            if (e.data?.type === "auth_ready" && !contractSent) {
              console.log("[wapi] auth_ready received, sending contract to popup");
              sendContract();
            }
          };
          window.addEventListener("message", readyHandler);
          console.log("[wapi] contractRequest — auth_ready listener attached, waiting for popup signal");
          timeoutId = setTimeout(() => {
            console.warn("[wapi] contractRequest — 30s timeout reached, contractSent:", contractSent);
            window.removeEventListener("message", responseHandler);
            if (readyHandler) {
              const eh = readyHandler;
              window.removeEventListener("message", eh);
            }
            if (!contractSent) {
              callback?.({ status: "error", errors: ["Auth popup closed — request cancelled"] });
            }
          }, 30000);
          return;
        }
        console.log("[wapi] contractRequest — no existing popup, opening new one");
        originalContractRequest(contracts, authOrigin, callback);
      }
    };
    return client;
  }
  async function checkExistingContracts(client, contracts, _token) {
    for (const c of contracts) {
      if (c.kind === "app") {
        const list = await client.listAppContracts();
        const origin = c.app_origin;
        if (!list.some((ac) => ac.allowed_origin === origin))
          return false;
      } else if (c.kind === "group") {
        const token = readTokenCookie();
        const decoded = token ? decodeJwt(token) : null;
        const username = decoded?.username;
        const provider = decoded?.provider;
        if (!username || !provider)
          return false;
        const groupName = c.name;
        const groupId = `${provider}/groups/users/${username}/${groupName.toLowerCase().replace(/ /g, "-")}`;
        try {
          await client.getGroup(groupId);
        } catch {
          return false;
        }
      }
    }
    return true;
  }
  function closeAuthPopup() {
    if (_authPopup && !_authPopup.closed) {
      console.log("[wapi] closeAuthPopup — sending close_popup to popup");
      _authPopup.postMessage({ type: "close_popup" }, "*");
    }
  }
  var web10 = {
    createV3Client: createV3Client2,
    openAuthPortal,
    authListen,
    closeAuthPopup,
    cookieDict,
    readTokenCookie,
    setTokenCookie,
    scrubTokenCookie,
    decodeJwt,
    isTokenExpired,
    Web10Error
  };
  if (typeof window !== "undefined") {
    window.web10 = web10;
  }
  var browser_default = web10;
})();
