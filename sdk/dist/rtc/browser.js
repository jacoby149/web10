(() => {
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
      let decoded;
      try {
        decoded = decodeURIComponent(val);
      } catch {
        return res;
      }
      try {
        res[key] = JSON.parse(decoded);
      } catch {
        res[key] = decoded;
      }
      return res;
    }, Object.create(null));
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

  // src/rtc/index.ts
  var PeerClass = null;
  function defaultIceServers() {
    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" }
    ];
  }
  function setPeer(Peer) {
    PeerClass = Peer;
  }
  function getPeer() {
    if (!PeerClass) {
      throw new Error(`PeerJS is not configured. Either:
` + '  1. Install peerjs and import it: `import Peer from "peerjs"; import { setPeer } from "web10-npm/rtc"; setPeer(Peer)`\n' + "  2. Or use a bundler that auto-resolves the peer dependency.");
    }
    return PeerClass;
  }
  function createRTC(wapi) {
    let peer = null;
    let stopped = false;
    let reconnectTimer = null;
    const outbound = new Map;
    const inbound = new Map;
    let onInboundRef = null;
    const connector = {
      peerId(provider, user, origin, label = "") {
        return `${provider} ${user} ${origin} ${label}`.replaceAll(".", "_");
      },
      async initP2P(onInbound, label = "", secure = true) {
        const PC = getPeer();
        const token = wapi.readToken();
        if (!token)
          throw new Error("Cannot init P2P without a token");
        const id = this.peerId(token.provider, token.username, token.site || "web10", label);
        const origin = new URL(`${secure ? "https" : "http"}://${wapi.state.rtcServer}`);
        if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
          throw new Error("RTC server must be a host, optionally with a port");
        }
        const local = origin.hostname === "localhost" || origin.hostname.endsWith(".localhost") || origin.hostname === "127.0.0.1" || origin.hostname === "[::1]";
        if (!secure && !local)
          throw new Error("Insecure RTC signaling is restricted to localhost");
        if (!/^[A-Za-z0-9_-]{0,64}$/.test(label))
          throw new Error("Invalid RTC label");
        stopped = false;
        const requestTicket = async () => {
          const session = wapi.state.token ?? readTokenCookie();
          if (!session || stopped)
            throw new Error("No active RTC session");
          console.log("[wapi-rtc] ticket request started");
          const response = await fetch(`${origin.origin}/ticket`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: session, label }),
            credentials: "omit",
            redirect: "error",
            signal: AbortSignal.timeout(1e4)
          });
          console.log("[wapi-rtc] ticket request finished", { status: response.status });
          if (!response.ok)
            throw new Error("RTC ticket authorization failed");
          const result = await response.json();
          if (typeof result?.ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.ticket) || result.peer_id !== id) {
            throw new Error("Invalid RTC ticket response");
          }
          return result.ticket;
        };
        let iceServers;
        if (wapi.state.iceServers && wapi.state.iceServers.length > 0) {
          iceServers = wapi.state.iceServers;
        } else {
          try {
            iceServers = await wapi.getIceServers();
          } catch {
            iceServers = defaultIceServers();
          }
        }
        if (stopped)
          throw new Error("RTC initialization cancelled");
        const ticket = await requestTicket();
        if (stopped)
          throw new Error("RTC initialization cancelled");
        const currentPeer = new PC(id, {
          host: origin.hostname,
          secure,
          port: Number(origin.port || (secure ? 443 : 80)),
          path: "/",
          token: ticket,
          iceServers
        });
        peer = currentPeer;
        let reconnecting = false;
        let retryDelay = 1000;
        const reconnect = async () => {
          if (stopped || reconnecting || currentPeer.destroyed || !currentPeer.disconnected)
            return;
          reconnecting = true;
          try {
            const fresh = await requestTicket();
            if (!stopped && !currentPeer.destroyed && currentPeer.disconnected) {
              currentPeer.options.token = fresh;
              currentPeer.reconnect();
              retryDelay = 1000;
            }
          } catch {
            console.warn("[wapi-rtc] reconnect authorization failed; retry scheduled");
          } finally {
            reconnecting = false;
            if (!stopped && !currentPeer.destroyed && currentPeer.disconnected) {
              reconnectTimer = setTimeout(reconnect, retryDelay);
              retryDelay = Math.min(retryDelay * 2, 30000);
            }
          }
        };
        currentPeer.on("disconnected", reconnect);
        if (onInbound && peer) {
          onInboundRef = onInbound;
          peer.on("connection", (raw) => {
            const conn = raw;
            inbound.set(conn.peer, conn);
            conn.on("data", (data) => onInbound(conn, data));
            conn.on("close", () => inbound.delete(conn.peer));
          });
        }
        return new Promise((resolve, reject) => {
          if (currentPeer.open) {
            resolve();
            return;
          }
          const timeout = setTimeout(() => {
            this.destroy();
            reject(new Error("RTC signaling connection timed out"));
          }, 1e4);
          let ready = false;
          currentPeer.on("open", () => {
            ready = true;
            clearTimeout(timeout);
            resolve();
          });
          currentPeer.on("error", () => {
            if (ready) {
              console.warn("[wapi-rtc] signaling error after admission");
              return;
            }
            clearTimeout(timeout);
            this.destroy();
            reject(new Error("RTC signaling connection failed"));
          });
          currentPeer.on("close", () => {
            clearTimeout(timeout);
            if (!ready)
              reject(new Error("RTC initialization cancelled"));
          });
        });
      },
      destroy() {
        stopped = true;
        if (reconnectTimer)
          clearTimeout(reconnectTimer);
        reconnectTimer = null;
        peer?.destroy();
        peer = null;
        outbound.clear();
        inbound.clear();
        onInboundRef = null;
      },
      connect(provider, username, origin, label = "") {
        if (!peer)
          throw new Error("P2P not initialized. Call initP2P first.");
        const id = this.peerId(provider, username, origin, label);
        const existing = outbound.get(id);
        if (existing)
          return existing;
        const conn = peer.connect(id);
        outbound.set(conn.peer, conn);
        conn.on("data", (data) => {
          if (onInboundRef)
            onInboundRef(conn, data);
        });
        conn.on("close", () => outbound.delete(conn.peer));
        return conn;
      },
      send(provider, username, origin, label, data) {
        const conn = this.connect(provider, username, origin, label);
        if (conn.open) {
          conn.send(data);
          return { connected: true };
        } else {
          conn.on("open", () => conn.send(data));
          return { connected: false };
        }
      }
    };
    return connector;
  }

  // src/rtc/browser.ts
  Object.assign(window, { web10rtc: { createRTC, setPeer } });
})();
