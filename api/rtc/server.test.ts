import { afterEach, expect, spyOn, test } from "bun:test";
import { createServer, request } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import { createRtcServer } from "./server";
import { createV3Client } from "../../sdk/src/v3";
import { createRTC, setPeer } from "../../sdk/src/rtc/index";

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function start(authorize: (token: string, label: string) => Promise<unknown> = async () => ({ peer_id: "verified ID" }), now?: () => number) {
  const rtc = createRtcServer({ certifyBaseUrl: "http://127.0.0.1", authorize, now });
  let connections = 0;
  const registered = new Set<string>();
  rtc.peerServer.on("connection", client => { connections++; registered.add(client.getId()); });
  rtc.peerServer.on("disconnect", client => registered.delete(client.getId()));
  await new Promise<void>(resolve => rtc.server.listen(0, "127.0.0.1", resolve));
  cleanup.push(rtc.close);
  const origin = `http://127.0.0.1:${(rtc.server.address() as AddressInfo).port}`;
  return { ...rtc, origin, registered, connections: () => connections };
}

function attempt(origin: string, query: string) {
  return new Promise<{ status: number; opened: boolean; messages: string[]; socket: WebSocket }>((resolve, reject) => {
    const socket = new WebSocket(`${origin.replace("http:", "ws:")}/peerjs?${query}`);
    let opened = false;
    const messages: string[] = [];
    const timer = setTimeout(() => { socket.terminate(); reject(new Error("WebSocket test timed out")); }, 2000);
    socket.on("open", () => { opened = true; });
    socket.on("message", data => {
      messages.push(JSON.parse(data.toString()).type);
      clearTimeout(timer); resolve({ status: 101, opened, messages, socket });
    });
    socket.on("error", () => {});
  });
}
const query = (ticket: string, id = "verified ID") => new URLSearchParams({ key: "peerjs", id, token: ticket }).toString();
async function closeSocket(socket: WebSocket) {
  await new Promise<void>(resolve => { socket.once("close", () => resolve()); socket.close(); });
}
async function mint(origin: string) {
  const response = await fetch(`${origin}/ticket`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "session-secret", label: "label" }) });
  return { response, body: await response.json() as { ticket: string; peer_id: string; expires_in: number } };
}
async function denied(rtc: Awaited<ReturnType<typeof start>>, q: string) {
  const before = rtc.connections();
  // Bun's ws client does not implement unexpected-response. Use a real RFC6455
  // HTTP upgrade request to witness the rejection status and response bytes.
  const result = await new Promise<{ status: number; upgraded: boolean; body: string }>((resolve, reject) => {
    const req = request(`${rtc.origin}/peerjs?${q}`, { headers: {
      Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    } });
    req.on("response", res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, upgraded: false, body }));
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy(); resolve({ status: res.statusCode!, upgraded: true, body: "" });
    });
    req.on("error", reject); req.end();
  });
  expect(result.status).toBe(401);
  expect(result.upgraded).toBe(false);
  expect(result.body).not.toContain("OPEN");
  expect(rtc.connections()).toBe(before);
}

test("configured API origin is mandatory, never inferred from credentials", () => {
  for (const certifyBaseUrl of [undefined, "", "ftp://api", "http://user:password@api", "http://api/path", "http://api?x=1"]) {
    expect(() => createRtcServer({ certifyBaseUrl })).toThrow();
  }
});

test("opaque ticket admits one exact identity; replay and active duplicate never upgrade/register", async () => {
  const rtc = await start(async (token, label) => {
    expect(token).toBe("session-secret"); expect(label).toBe("label"); return { peer_id: "verified ID" };
  });
  const { response, body } = await mint(rtc.origin);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(body).toEqual({ ticket: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), peer_id: "verified ID", expires_in: 30 });
  const valid = await attempt(rtc.origin, query(body.ticket));
  expect(valid.opened).toBe(true); expect(valid.messages).toEqual(["OPEN"]);
  expect(rtc.registered.has("verified ID")).toBe(true);
  await denied(rtc, query(body.ticket));
  const duplicate = await mint(rtc.origin);
  await denied(rtc, query(duplicate.body.ticket));
  expect(rtc.registered.size).toBe(1);
  await closeSocket(valid.socket);
});

test("wrong ID consumes ticket; expiry rejects at exact 30-second boundary", async () => {
  let time = 0;
  const rtc = await start(undefined, () => time);
  const first = await mint(rtc.origin);
  await denied(rtc, query(first.body.ticket, "wrong"));
  await denied(rtc, query(first.body.ticket));
  const second = await mint(rtc.origin);
  time = 30_000;
  await denied(rtc, query(second.body.ticket));
  const third = await mint(rtc.origin);
  time = 59_999;
  const valid = await attempt(rtc.origin, query(third.body.ticket));
  expect(valid.messages).toEqual(["OPEN"]); await closeSocket(valid.socket);
});

test("missing/duplicate query credentials, JWTs, wrong keys and oversized input never register", async () => {
  const rtc = await start();
  const { body } = await mint(rtc.origin);
  for (const q of ["", query("session.jwt.secret"), query("x".repeat(3000)),
    query(body.ticket) + "&key=peerjs", query(body.ticket) + "&id=verified+ID",
    query(body.ticket) + `&token=${body.ticket}`, query(body.ticket).replace("key=peerjs", "key=other"),
    `key=peerjs&token=${body.ticket}`, query(body.ticket, "x".repeat(513))]) {
    await denied(rtc, q);
  }
  expect(rtc.registered.size).toBe(0);
});

test("verifier failures and malformed responses fail closed without credential echo", async () => {
  for (const value of [null, {}, { peer_id: 1 }, { peer_id: "" }, { peer_id: "x", extra: true }, { peer_id: "x".repeat(513) }, "secret"]) {
    const rtc = await start(async () => value);
    const { response, body } = await mint(rtc.origin);
    expect(response.status).toBe(401); expect(JSON.stringify(body)).not.toContain("secret");
    await denied(rtc, query("a".repeat(43)));
    expect(rtc.registered.size).toBe(0);
  }
  const rtc = await start(async () => { throw new Error("session-secret"); });
  expect((await mint(rtc.origin)).response.status).toBe(401);
});

test("real axios upstream POST uses fixed authorize path and does not follow 307", async () => {
  let redirected = 0;
  let requests = 0;
  const upstream = createServer((req, res) => {
    if (req.url !== "/rtc/authorize") { redirected++; res.end(); return; }
    requests++;
    expect(req.method).toBe("POST");
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      expect(JSON.parse(body)).toEqual({ token: "session-secret", label: "label" });
      if (requests === 1) { res.writeHead(307, { Location: "/leak" }); res.end(); }
      else { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"peer_id":"verified ID"}'); }
    });
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise(resolve => { upstream.close(() => resolve()); upstream.closeAllConnections(); }));
  const rtc = createRtcServer({ certifyBaseUrl: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}` });
  await new Promise<void>(resolve => rtc.server.listen(0, "127.0.0.1", resolve));
  cleanup.push(rtc.close);
  const origin = `http://127.0.0.1:${(rtc.server.address() as AddressInfo).port}`;
  expect((await mint(origin)).response.status).toBe(401);
  expect(redirected).toBe(0);
  const valid = await attempt(origin, query((await mint(origin)).body.ticket));
  expect(valid.messages).toEqual(["OPEN"]); await closeSocket(valid.socket);
});

test("request parsing has a 4KB bound and safe errors", async () => {
  let calls = 0;
  const rtc = await start(async () => { calls++; return { peer_id: "verified ID" }; });
  for (const body of ['{"token":', JSON.stringify({ token: "x".repeat(5000), label: "label" }),
    JSON.stringify({ token: "secret", label: 1 }), JSON.stringify({ token: "secret", label: "x".repeat(257) })]) {
    const response = await fetch(`${rtc.origin}/ticket`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    expect(response.status).toBe(400); expect(await response.text()).not.toContain("secret");
  }
  expect(calls).toBe(0);
});

test("64 pending authorizations are bounded and refusal does not call verifier", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const rtc = await start(async () => { calls++; await gate; return { peer_id: "verified ID" }; });
  const requests = Array.from({ length: 64 }, () => mint(rtc.origin));
  while (calls < 64) await new Promise(resolve => setTimeout(resolve, 5));
  expect((await mint(rtc.origin)).response.status).toBe(503); expect(calls).toBe(64);
  release(); await Promise.all(requests);
});

test("4096 tickets are bounded; expired tickets free capacity", async () => {
  const logs = spyOn(console, "info").mockImplementation(() => {});
  cleanup.push(() => { logs.mockRestore(); });
  let time = 0;
  const rtc = await start(undefined, () => time);
  for (let i = 0; i < 4096; i++) expect((await mint(rtc.origin)).response.status).toBe(200);
  expect((await mint(rtc.origin)).response.status).toBe(503);
  time = 30_000;
  expect((await mint(rtc.origin)).response.status).toBe(200);
}, 20_000);

test("parallel replay attempts get no additional OPEN or registry entry", async () => {
  const rtc = await start();
  const { body } = await mint(rtc.origin);
  const opening = attempt(rtc.origin, query(body.ticket));
  // Once the first connection registers, a second identical upgrade is rejected.
  const valid = await opening;
  await Promise.all(Array.from({ length: 8 }, () => denied(rtc, query(body.ticket))));
  expect(rtc.connections()).toBe(1);
  expect(rtc.registered.size).toBe(1);
  await closeSocket(valid.socket);
});

test("tickets are process-local and discovery is disabled", async () => {
  const first = await start();
  const { body } = await mint(first.origin);
  const restarted = await start();
  await denied(restarted, query(body.ticket));
  const discovery = await fetch(`${first.origin}/peerjs/peers`);
  expect(discovery.status).toBe(401);
  expect(first.registered.size).toBe(0);
});

test("WebSocket signaling payloads above 64KB close the admitted socket", async () => {
  const rtc = await start();
  let delivered = 0;
  rtc.peerServer.on("message", () => { delivered++; });
  const { body } = await mint(rtc.origin);
  const valid = await attempt(rtc.origin, query(body.ticket));
  const closed = new Promise<number>(resolve => valid.socket.once("close", code => resolve(code)));
  valid.socket.send(JSON.stringify({ type: "HEARTBEAT", payload: "x".repeat(64 * 1024) }));
  expect(await closed).toBe(1009);
  expect(delivered).toBe(0);
});

test("real Python signature verification -> RTC ticket -> SDK WebSocket admission", async () => {
  // Only unused ClickHouse/storage imports are mocked. The router, certify,
  // JWT signature/provider/expiry checks, HTTP exchange, and upgrade are real.
  const code = `
import datetime, json, runpy, socket
runpy.run_path('tests/conftest.py')
import jwt, uvicorn
from fastapi import FastAPI
from app.endpoints.system import router
import app.settings as settings
app = FastAPI()
app.include_router(router)
sock = socket.socket()
sock.bind(('127.0.0.1', 0))
token = jwt.encode({'username': 'alice', 'provider': settings.PROVIDER,
    'site': 'app.example', 'expires': (datetime.datetime.utcnow() + datetime.timedelta(minutes=1)).isoformat()},
    settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
print(json.dumps({'port': sock.getsockname()[1], 'token': token}), flush=True)
uvicorn.Server(uvicorn.Config(app, log_level='critical', access_log=False)).run(sockets=[sock])
`;
  const backend = spawn('uv', ['run', 'python', '-c', code], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
  });
  cleanup.push(() => new Promise<void>(resolve => {
    if (backend.exitCode !== null || backend.signalCode !== null) { resolve(); return; }
    backend.once('exit', () => resolve()); backend.kill('SIGTERM');
  }));
  const config = await new Promise<{ port: number; token: string }>((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Python backend did not start')), 15_000);
    backend.once('error', error => { clearTimeout(timeout); reject(error); });
    backend.once('exit', () => { clearTimeout(timeout); reject(new Error('Python backend exited before readiness')); });
    backend.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('\n')) { clearTimeout(timeout); resolve(JSON.parse(output.split('\n')[0])); }
    });
  });
  const api = `http://127.0.0.1:${config.port}`;
  let ready = false;
  for (let tries = 0; tries < 100; tries++) {
    try {
      const response = await fetch(`${api}/rtc/authorize`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: config.token, label: 'test' }) });
      if (response.ok) { ready = true; break; }
    } catch { /* the bound socket has not started accepting yet */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  expect(ready).toBe(true);
  const server = createRtcServer({ certifyBaseUrl: api });
  await new Promise<void>(resolve => server.server.listen(0, '127.0.0.1', resolve));
  cleanup.push(server.close);
  const host = `127.0.0.1:${(server.server.address() as AddressInfo).port}`;
  let admissions = 0;
  server.peerServer.on('connection', () => { admissions++; });
  await denied({ ...server, origin: `http://${host}`, registered: new Set(), connections: () => admissions }, query(config.token));
  let presented = '';
  class SignalingPeer {
    open = false;
    disconnected = false;
    destroyed = false;
    socket: WebSocket;
    handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    constructor(public id: string, public options: { host: string; port: number; path: string; secure: boolean; token: string }) {
      presented = options.token;
      this.socket = new WebSocket(`ws://${options.host}:${options.port}/peerjs?${query(options.token, id)}`);
      this.socket.on('message', data => {
        if (JSON.parse(data.toString()).type === 'OPEN') { this.open = true; this.emit('open'); }
      });
      this.socket.on('error', () => this.emit('error'));
      this.socket.on('close', () => this.emit('close'));
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    }
    emit(event: string) { for (const handler of this.handlers.get(event) ?? []) handler(); }
    destroy() { this.destroyed = true; this.socket.close(); }
    reconnect() { throw new Error('not used'); }
    connect(): never { throw new Error('not used'); }
  }
  setPeer(SignalingPeer);
  const client = createV3Client({ apiOrigin: api, rtcServer: host, token: config.token, iceServers: [{ urls: 'stun:example' }] });
  const connector = createRTC(client);
  cleanup.push(() => connector.destroy());
  await connector.initP2P(null, 'test', false);
  expect(presented).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(presented).not.toBe(config.token);
  const notASession = await fetch(`${api}/rtc/authorize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: presented, label: 'test' }),
  });
  expect(notASession.status).toBe(401);
  connector.destroy();
}, 25_000);
