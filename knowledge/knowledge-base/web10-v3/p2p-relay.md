# P2P Connectivity (STUN)

WebRTC P2P (real-time messages + presence) needs a way for two browsers to find
each other across NAT. **STUN** (Session Traversal Utilities for NAT) is the
mechanism: it lets a peer behind a NAT learn its public IP:port mapping so the
other peer can reach it directly.

The node hands every P2P client a set of **public STUN servers** (five Google
STUN endpoints) via `POST /ice`. The browser's ICE agent uses them to discover
candidates and establish the direct peer-to-peer data channel. Once connected,
all traffic flows peer-to-peer — the node is not in the data path.

## Why STUN-only

STUN works for the vast majority of networks:

- **Full-cone NAT** (most home broadband) — works
- **Restricted NAT** (common) — works
- **Symmetric NAT** (~5-10% of home networks, some carriers) — does not work
- **Corporate/school firewalls** that block outbound UDP — may not work

The trade-off is deliberate: a peer behind a symmetric NAT or a walled
firewall cannot establish a P2P connection. This is an acceptable limitation
for the open, self-hostable model (D41) — the alternative (a TURN relay) adds
operational cost (a coturn container, port forwarding, credential minting,
relay bandwidth) that does not justify itself for the node's threat model.

## The flow

```
Browser (initP2P)
  │  1. POST /ice  { token }        (node-gated, like /certify)
  ▼
Node  ── returns the STUN server set ──▶
  │  2. { iceServers: [stun:stun.l.google.com:19302, …] }
  ▼
Browser ── PeerJS ICE with that config ──▶
  │  3. ICE uses STUN to discover candidates,
  │     then establishes the direct data channel.
  ▼
Peer-to-peer data channel (no relay, no node involvement)
```

The SDK's `rtc` module calls `wapi.getIceServers()` at `initP2P` when no
explicit `iceServers` were passed to the client. The node's `POST /ice`
returns the STUN set. If the fetch fails (e.g. the node is unreachable), the
SDK falls back to its built-in STUN default (the same five servers).

## The `/ice` endpoint

`POST /ice` (next to `/certify`) requires a valid node token (the same
`certify` gate: signature + provider + expiry, I2). It returns:

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:stun1.l.google.com:19302" },
    { "urls": "stun:stun2.l.google.com:19302" },
    { "urls": "stun:stun3.l.google.com:19302" },
    { "urls": "stun:stun4.l.google.com:19302" }
  ]
}
```

Five STUN servers (not one) give ICE more candidates to work with — a single
STUN server that is rate-limited or unreachable is a direct cause of the
"handshake goes one way" flakiness.

## D60 — the node stays generic

`POST /ice` is a **universal primitive**, not an app concept: it answers
"what ICE servers can I use to do P2P on this node?" Any app that does WebRTC
(messages, video calls, file transfer) consumes the same endpoint. It names no
social concept.

## What it does not fix

STUN cannot cross a symmetric NAT or a firewall that blocks outbound UDP. A
peer behind one of those will not appear online to the other. There is no
server-side fallback — the P2P channel is either established or it is not.
The app degrades gracefully: the peer shows as offline, and messages queue
until the connection is established (or never, for the walled peer).
