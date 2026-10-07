import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import axios from "axios";
import express from "express";
import { ExpressPeerServer } from "peer";
import { WebSocketServer } from "ws";

export function createRtcServer(options: {
  certifyBaseUrl: string | undefined;
  authorize?: (token: string, label: string) => Promise<unknown>;
  now?: () => number;
}) {
  if (!options.certifyBaseUrl) throw new Error("CERTIFY_BASE_URL is required");
  const base = new URL(options.certifyBaseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
      base.search || base.hash || base.pathname !== '/') {
    throw new Error("CERTIFY_BASE_URL must be a fixed HTTP(S) origin");
  }
  const authorize = options.authorize ?? (async (token, label) => {
    const response = await axios.post(`${base.origin}/rtc/authorize`, { token, label }, {
      timeout: 5000, maxRedirects: 0, maxContentLength: 4096,
      validateStatus: status => status === 200,
    });
    return response.data;
  });
  const now = options.now ?? Date.now;
  const tickets = new Map<string, { id: string; expires: number }>();
  const activeIds = new Set<string>();
  let pending = 0;
  const prune = () => {
    const time = now();
    for (const [ticket, value] of tickets) if (time >= value.expires) tickets.delete(ticket);
  };
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    next();
  });
  app.options("/ticket", (_req, res) => { res.sendStatus(204); });
  app.post("/ticket", express.json({ limit: "4kb" }), async (req, res) => {
    const body = req.body;
    if (!body || typeof body.token !== "string" || !body.token.length || body.token.length > 4096 ||
        typeof body.label !== "string" || !/^[A-Za-z0-9_-]{0,64}$/.test(body.label) ||
        Object.keys(body).length !== 2) {
      res.status(400).json({ error: "Invalid request" }); return;
    }
    prune();
    if (pending >= 64 || tickets.size + pending >= 4096) {
      console.info("[rtc] authorization refused", { outcome: "capacity" });
      res.status(503).json({ error: "Capacity exceeded" }); return;
    }
    pending++;
    console.info("[rtc] authorization started", { pending });
    try {
      const verified = await authorize(body.token, body.label);
      if (!verified || typeof verified !== "object" || Object.keys(verified).length !== 1 ||
          !("peer_id" in verified) || typeof verified.peer_id !== "string" ||
          !verified.peer_id.length || verified.peer_id.length > 512 || /[\x00-\x1f\x7f]/.test(verified.peer_id)) {
        throw new Error("Invalid authorization response");
      }
      const ticket = randomBytes(32).toString("base64url");
      tickets.set(ticket, { id: verified.peer_id, expires: now() + 30_000 });
      console.info("[rtc] authorization finished", { outcome: "issued" });
      res.json({ ticket, peer_id: verified.peer_id, expires_in: 30 });
    } catch {
      // Axios errors contain the submitted credentials; never log the error object.
      console.info("[rtc] authorization finished", { outcome: "denied" });
      res.status(401).json({ error: "Authorization failed" });
    } finally { pending--; }
  });
  app.use(( _err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ error: "Invalid request" });
  });
  const server = createServer(app);
  const sockets = new Set<Socket>();
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  let websocketServer: WebSocketServer | undefined;
  const peerServer = ExpressPeerServer(server, {
    path: "/", proxied: true, allow_discovery: false,
    corsOptions: { origin: "*", credentials: false },
    createWebSocketServer: config => {
      websocketServer = new WebSocketServer({ ...config, maxPayload: 64 * 1024,
        verifyClient: ({ req }: { req: IncomingMessage }) => {
          let accepted = false;
          if (req.url && req.url.length <= 2048) {
            const query = new URL(req.url, "http://rtc.invalid").searchParams;
            const key = query.get("key"), id = query.get("id"), token = query.get("token");
            if (query.getAll("key").length === 1 && query.getAll("id").length === 1 &&
                query.getAll("token").length === 1 && key === "peerjs" && id && id.length <= 512 &&
                token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
              const entry = tickets.get(token);
              // Consume synchronously, including wrong-ID attempts, before any upgrade.
              tickets.delete(token);
              accepted = !!entry && now() < entry.expires && entry.id === id && !activeIds.has(id);
            }
          }
          console.info("[rtc] admission", { outcome: accepted ? "accepted" : "denied" });
          return accepted;
        },
      });
      websocketServer.on("connection", socket => {
        // Bun's ws implementation ignores maxPayload. Gate delivery as well so
        // oversized messages cannot reach PeerJS on the deployed Bun runtime.
        const emit = socket.emit;
        socket.emit = function (event, ...args) {
          if (event === "message" && Buffer.byteLength(args[0]) > 64 * 1024) {
            this.close(1009); return false;
          }
          return emit.call(this, event, ...args);
        };
      });
      return websocketServer;
    },
  });
  peerServer.on("connection", client => { activeIds.add(client.getId()); });
  peerServer.on("disconnect", client => { activeIds.delete(client.getId()); });
  peerServer.on("error", () => { console.info("[rtc] signaling error", { outcome: "rejected" }); });
  app.use("/", peerServer);
  return { app, server, peerServer, close: () => {
    tickets.clear();
    for (const client of websocketServer?.clients ?? []) client.terminate();
    websocketServer?.close();
    server.close();
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
  } };
}
