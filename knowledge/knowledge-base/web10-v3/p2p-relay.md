# P2P Relay (TURN)

WebRTC P2P (real-time messages + presence) needs a way for two browsers to find
each other across NAT. STUN alone does UDP hole-punching, which only works when
both peers sit behind NAT types that allow it. A peer behind a symmetric NAT,
CGNAT (most mobile networks), or a firewall that blocks inbound UDP can't be
reached by hole-punching — the channel goes **one way**, and that is exactly the
"one online, the other offline" flakiness the operator reported.

A **TURN relay** is the fallback: when the direct path is walled off, both peers
relay their media through a server they can both reach. STUN stays the fast path
(direct, free, low-latency); TURN is the safety net.

## The model

The node is the credential authority. It holds a **TURN secret** (an HMAC key)
and, on request, mints a **time-limited credential** for an authenticated user.
The secret never leaves the node — only the derived, expiring credential is
handed to the client. This is the standard coturn **RFC 8484** (time-based
credentials) scheme:

```
username   = <expiry timestamp>            # seconds since epoch
credential = base64( HMAC-SHA1( secret, username ) )
```

coturn, started with `--use-auth-secret --static-auth-secret=<secret>`,
recomputes exactly this HMAC for the username's expiry and accepts the
allocation only if the credential matches **and** the username is not in the
past. So a credential is single-use-per-window, expires on its own, and is
useless without the node's secret.

## The flow

```
Browser (initP2P)
  │  1. POST /ice  { token }        (node-gated, like /certify)
  ▼
Node  ── mints (username, credential) from TURN_SECRET ──▶
  │  2. { iceServers: [stun…, turn: {urls, username, credential}] }
  ▼
Browser ── PeerJS ICE with that config ──▶
  │  3. STUN first (direct). If the peer is unreachable,
  │     ICE falls back to the TURN relay.
  ▼
TURN (coturn) ── relays the data channel ──▶ other browser
```

The SDK's `rtc` module calls `wapi.getIceServers()` at `initP2P` when no
explicit `iceServers` were passed to the client. The node's `POST /ice` returns
the STUN set always, plus the TURN server **only when** `TURN_URL` and
`TURN_SECRET` are both configured. A node without a relay returns STUN-only and
behaves exactly as before — TURN is opt-in per node.

## Why the node mints, not the client

- **The secret stays server-side.** A static shared credential in the client
  bundle would let anyone mint relay sessions and abuse the node's TURN.
- **Scoped + expiring (I5).** Each credential is a timestamp the node chose; it
  expires and can't be replayed past its window.
- **Gated like /certify.** `POST /ice` runs the same `certify` (signature +
  provider + expiry, I2) and requires a token, so only a real node user gets a
  relay credential.

## D60 — the node stays generic

`POST /ice` is a **universal primitive**, not an app concept: it answers
"what ICE servers can I use to do P2P on this node?" Any app that does WebRTC
(messages, video calls, file transfer) consumes the same endpoint. It names no
social concept. The TURN relay itself is node-level infrastructure (a container
in the deploy), not a table or endpoint shaped for one app.

## Deployment

The relay is a **coturn** container, optional (a `turn` compose profile). It is
off by default so a node with no relay keeps working STUN-only.

| Env | Meaning |
|---|---|
| `TURN_URL` | The public TURN URI the browser connects to (e.g. `turn:turn.web10.app:3478`). Empty = STUN-only. |
| `TURN_SECRET` | The HMAC key. Must match coturn's `--static-auth-secret`. Empty = STUN-only. |
| `TURN_CRED_TTL` | Credential lifetime in seconds (default 3600). |

coturn connects **directly** from the browser (UDP/TCP) — the NPM proxy can't
forward UDP — so the service publishes its ports on the host (3478 UDP/TCP,
5349 TCP, 35000–35200 UDP) rather than riding the proxy network. The media
range is a tight 200 ports (`--min-port=35000 --max-port=35200`), not the 16k
IANA ephemeral default — one relay port is allocated per active P2P media flow,
and 200 concurrent relayed callers is far more than a creator node sees. Widen
it (and the router forward) only if you outgrow that. The image's entrypoint
auto-prepends `turnserver`, so the compose `command` is flags only.

**Production notes:** `turns://` (TLS on 5349) is the recommended transport and
needs a cert for the TURN hostname; until one is provisioned the service runs
plain `turn:` on 3478, which is fine on most networks. The host firewall must
allow the UDP relay range. The image is mirrored to GHCR like every other
external image (`e2e/mirror-images.json`).

**How it comes up on the box:** the real deploy path is GitHub Actions → SSH →
`docker compose up` (`deploy.yml`), not Portainer (Portainer is only the
management UI). `deploy.yml` reads `TURN_SECRET` from the stack env and passes
`--profile turn` only when it's set — so a relay-less node stays STUN-only and
an opted-in one brings the relay up with no manual flag. A manual SSH redeploy
must add `--profile turn` itself. `scripts/sync-dns.py` creates the `turn.{zone}`
A record (peers connect to the TURN host directly, not via NPM). `scripts/
smoke.sh` checks `POST /ice` is reachable when the turn container is up. Full
runbook: `ubuntu-deployment/README.md` "TURN relay (optional)".

## What it does not fix

TURN relays media that *can* reach the relay. It cannot wake a genuinely
offline device (closed browser, asleep laptop) — there is no other channel by
design (no server push; CRUD is truth). It stops a *wrong* online/offline state
when the real problem is a NAT the direct path can't cross.
