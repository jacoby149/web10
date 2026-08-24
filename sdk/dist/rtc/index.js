// src/rtc/index.ts
var PeerClass = null;
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
  const outbound = new Map;
  const inbound = new Map;
  const connector = {
    peerId(provider, user, origin, label = "") {
      return `${provider} ${user} ${origin} ${label}`.replaceAll(".", "_");
    },
    initP2P(onInbound, label = "", secure = true) {
      const PC = getPeer();
      const token = wapi.readToken();
      if (!token)
        throw new Error("Cannot init P2P without a token");
      const id = this.peerId(token.provider, token.username, token.site, label);
      peer = new PC(id, {
        host: wapi.state.rtcServer,
        secure,
        port: secure ? 443 : 80,
        path: "/",
        token: `${wapi.state.token}~${label}`
      });
      if (onInbound && peer) {
        peer.on("connection", (raw) => {
          const conn = raw;
          inbound.set(conn.peer, conn);
          conn.on("data", (data) => onInbound(conn, data));
          conn.on("close", () => inbound.delete(conn.peer));
        });
      }
      return new Promise((resolve) => {
        if (!peer) {
          resolve();
          return;
        }
        if (peer.open) {
          resolve();
          return;
        }
        peer.on("open", () => resolve());
        setTimeout(resolve, 1e4);
      });
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
export {
  setPeer,
  createRTC
};
