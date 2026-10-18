# SDK Scope C: RTC Whole-File L1 Receipt

- Pin: `caeed44278adb65d19f5c737ed9188ccf589b69c`; date: 2026-10-18.
- Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Exact scope: `sdk/src/rtc/index.ts`, inclusive logical lines **1-227**, **227 newlines / 227 logical lines**, terminal newline present. Comments, blanks and EOF included; no gaps.
- Disposition: coverage complete, security review pending. **Zero new confirmed C/I finding IDs**; existing **BP-3 OPEN** is server-admission context, not newly reproduced or closed here.
- Only this receipt written. No source, bundle, central-state or git mutations; no installs, live browser, credentials, socket or network use.

## Orient And Intent

- Read root AGENTS, scan contract, security theory, learnings, I1-I6 overview, six-class checklist, design-intent gate, thesis, current plan/lane/changelog, October SDK audit, prior RTC receipt and SDK API auth/configuration KB.
- Onboarding: S-1/S-6 concern popup boundaries outside C; S-2/B-4 is body/log composition, not a new RTC finding. S-4 metadata decode and S-5 JS-readable cookies/lifetime are accepted, not authorization proofs.
- Recession: this file still supplies a bearer plus label to PeerJS and has no local destroy/logout hook; S6 teardown/admission work remains open. No prior fix or regression is inferred from stale audit prose.
- Obvious gap: distinguish peer ID routing from authenticated identity and app-defined payload fields from authority. Dependency handshake transport, consumer trust, actual logout and server revocation require L2+ tracing.
- Design intent: optional generic bidirectional P2P, configurable ICE/TURN with STUN fallback; preserve D41 readable-node/no-default-E2E and D56 telemetry decisions. No behavior changed, decision reversed or new conventional-standard exception proposed. Fresh independent design-intent review remains pending.

## Exhaustive Symbol Coverage

| Logical range | Declarations and paths reviewed |
|---|---|
| 1-29 | module/example/import; optional module-global PeerClass; ICE declaration commentary |
| 30-51 | RTCIceServer urls/username/credential; defaultIceServers five literal STUN URLs |
| 52-71 | setPeer injection and getPeer configured/unconfigured branches |
| 72-94 | createRTC closure, peer, inbound/outbound Maps, callback reference; peerId concatenation and dot replacement |
| 95-152 | initP2P: constructor/token guards, metadata identity, explicit/fetched/fallback ICE, PeerJS options/token serialization, inbound connection/data/close, open/already-open/null/timeout resolution |
| 153-170 | connect initialization guard, keyed reuse, creation/cache, outbound data forwarding and close deletion |
| 171-186 | send open/immediate and deferred-open paths, connected result, connector return |
| 187-227 | RTCConnector all methods; PeerJSOptions all fields; PeerConnection data/event/close shape; PeerInstance id/open/on/connect; EOF |

## All Six Classes

1. **Access control (I1/I2/I3/I5):** readToken metadata constructs routing identity, not a document authorization decision. Inbound conn/data are cast/forwarded, without application schema, sender-field binding or allowlist; outbound replies use the same callback. Unknown data delivery alone is normal generic transport, not authenticated impersonation. No local database read, grant or signature verifier. Actual issuer/admission remains BP-3; helpers/server not certified.
2. **Injection:** no DOM/template, eval, SQL, shell, filesystem or executable-deserialization sink. Synthetic markup remains inert data in a capture callback. No manufactured application XSS sink or XSS finding. Caller-controlled constructor and callbacks are deliberate integration seams, not hostile remote code loading.
3. **Boundaries/transport (I5/I6):** options contain configured host, `/`, secure=true/443 by default, explicit false/80, and `${state.token}~${label}`. This file builds no credential URL and does not implement PeerJS wire serialization. Extra `~` is preserved locally. Actual handshake URL/log exposure, TLS downgrade reachability and label parsing are UNVERIFIED, not a transport finding from a fake constructor. No window/postMessage/cookie access or cross-store operation.
4. **Availability:** timeout resolves without peer.open; deferred send listeners persist and can fire repeatedly; maps/listeners/payloads are unbounded, no error/disconnected handling. Reinit can orphan a peer and old close callbacks can delete a newer same-key entry. Route these to reliability, not C/I IDs.
5. **Data lifecycle:** only init reads token metadata; send/data callbacks do not recheck expiry/logout. No destroy/dispose/reset API, reinit does not clear maps, and null-handler reinit does not clear onInboundRef. No message replay/dedup layer: repeated data delivers twice; cache reuse is connection dedup only. A token change during ICE await can combine old ID metadata with new/empty serialized token. These are proven local states, not proof of continued authenticated traffic or private-data disclosure after actual logout/revocation.
6. **Hygiene:** no secret literals, runtime token logs or persistence sinks. ICE credential fields are types/configuration, not embedded credentials. Module-global PeerClass assumes trusted application setup. STUN-only comment at 41 conflicts with optional fetched TURN at 111; documentation/reliability drift, not an exploit. No bundle/dependency implementation coverage claimed.

## Executable Offline Proof

Run from repo root with Node v24.18.0. Actual pinned source is type-stripped, not reimplemented. PeerJS/events, window/cookie and ICE helpers are synthetic capture/deny sinks; timers are manually driven.

```sh
node --experimental-vm-modules --input-type=module -e '
import vm from "node:vm"; import {stripTypeScriptTypes} from "node:module"; import {execFileSync} from "node:child_process"; import assert from "node:assert/strict";
const raw=execFileSync("git",["show","caeed44278adb65d19f5c737ed9188ccf589b69c:sdk/src/rtc/index.ts"],{encoding:"utf8"}); assert.equal(raw.split("\n").length-1,227);
const peers=[],seen=[],sent=[],timers=[],cookies=[]; let touches=0,reads=0,ice=0;
const m=new vm.SourceTextModule(stripTypeScriptTypes(raw),{context:vm.createContext({setTimeout:f=>timers.push(f),window:new Proxy({},{get(){touches++;throw Error("window forbidden");}}),document:{set cookie(v){cookies.push(v);}},fetch(){throw Error("network forbidden");}})}); await m.link(()=>{throw Error("import forbidden");}); await m.evaluate(); const {createRTC,setPeer,defaultIceServers}=m.namespace;
class E {h={};on(e,f){(this.h[e]??=[]).push(f);}emit(e,...v){for(const f of this.h[e]??[])f(...v);}}
class C extends E {open=true;constructor(peer){super();this.peer=peer;}send(v){sent.push(v);}close(){this.open=false;this.emit("close");}}
class P extends E {open=true;constructor(id,opts){super();this.id=id;this.opts=opts;peers.push(this);}connect(id){return new C(id);}}
const w={state:{token:"synthetic",rtcServer:"rtc.invalid",iceServers:[{urls:"stun:example.invalid"}]},readToken(){reads++;return this.state.token?{provider:"node.invalid",username:"alice",site:"app.invalid"}:null;},async getIceServers(){ice++;return [];}}; const r=createRTC(w);
await assert.rejects(r.initP2P(null),/not configured/);setPeer(P);w.state.token="";await assert.rejects(r.initP2P(null),/without a token/);w.state.token="synthetic";
await r.initP2P((c,d)=>seen.push([c.peer,d]),"tab~extra");assert.equal(peers[0].opts.token,"synthetic~tab~extra");assert.equal(peers[0].opts.port,443);assert.equal(peers[0].opts.secure,true);assert.equal(ice,0);
assert.equal(r.peerId("a.b","u","o"),r.peerId("a_b","u","o"));assert.equal(r.peerId("a b","c","d"),r.peerId("a","b c","d"));
const c=new C("unknown claimed peer"),d={from:"different",html:"<b>inert</b>"};peers[0].emit("connection",c);c.emit("data",d);c.emit("data",d);assert.equal(seen.length,2);assert.equal(seen[0][1],d);
const o=r.connect("n","bob","app");assert.equal(r.connect("n","bob","app"),o);o.emit("data",d);assert.equal(seen.length,3);assert.equal(r.send("n","bob","app","",d).connected,true);o.close();const q=r.connect("n","bob","app");assert.notEqual(q,o);q.open=false;assert.equal(r.send("n","bob","app","",d).connected,false);q.emit("open");assert.equal(sent.length,2);
const before=reads;w.state.token="";c.emit("data",d);r.send("n","bob","app","",d);q.emit("open");assert.equal(reads,before);assert.equal(seen.length,4);assert.equal(sent.length,4);assert.equal("destroy" in r,false);assert.equal("signOut" in r,false);
w.state.token="new";await r.initP2P(null);assert.equal(r.connect("n","bob","app"),q);q.emit("data",d);assert.equal(seen.length,5);
w.state.iceServers=[];await r.initP2P(null,"",false);assert.equal(peers.at(-1).opts.port,80);assert.equal(peers.at(-1).opts.secure,false);assert.equal(ice,1);w.getIceServers=async()=>{throw Error("offline");};await r.initP2P(null);assert.equal(peers.at(-1).opts.iceServers.length,5);assert.equal(defaultIceServers().length,5);
let release;w.getIceServers=()=>new Promise(f=>release=f);w.state.token="old";const pending=r.initP2P(null);w.state.token="";release([]);await pending;assert.equal(peers.at(-1).opts.token,"~");assert.equal(peers.at(-1).id,"node_invalid alice app_invalid ");
class Waiting extends P {constructor(...a){super(...a);this.open=false;}}setPeer(Waiting);w.state.token="synthetic";w.state.iceServers=[{urls:"stun:example.invalid"}];let resolved=false;const wait=createRTC(w).initP2P(null).then(()=>resolved=true);await Promise.resolve();assert.equal(resolved,false);timers.at(-1)();await wait;assert.equal(peers.at(-1).open,false);
assert.equal(touches,0);assert.equal(cookies.length,0);console.log("227 newlines/logical; all assertions satisfied; fake PeerJS; zero network/window/cookie sinks");
'
```

Result: all assertions satisfied; expected experimental warnings only. Initial combined run stalled its timeout setup on a still-deferred fake ICE helper and failed with `timers.at(...) is not a function`; corrected harness selects explicit ICE before the waiting-peer case. No product logic changed or failed result hidden.

## UNVERIFIED L2+ Candidates And Limits

- **C-U1 / existing BP-3:** actual PeerJS credential URL/encoding, server split semantics, provider/label/ID binding, delimiter and dot/underscore collision reachability. Synthetic equality is not proof an attacker can register a victim ID; verify allowed identity characters and authoritative server checks.
- **C-U2 / S6 lifecycle:** trace actual signOut, app teardown, peer destroy, reconnect and server expiry/revocation. Clearing a fake state token is not executing real logout; retained fake data/send callbacks do not establish authenticated post-logout delivery.
- **C-U3 / consumer authority:** inspect whether consumers treat conn.peer or payload.from as verified, whether duplicate payloads mutate protected state, and where rendering occurs. No local schema/dedup requirement alone demonstrates an auth bypass, replay exploit or XSS.
- No real origin, issuer, token validity, network admission, DTLS/WebRTC, private-data access, dependency internals, packaged/copied artifact comparison or deployed behavior tested. Other SDK source/tests and callers excluded from coverage. No PASS, fix, fresh reviewer, three-dry or model-diverse sign-off claimed.
