# Multi-device P2P — one user, up to three live devices

A user on web10 is rarely on one device. They're on their phone AND their
laptop, and when a friend messages them, both should light up. Today that
doesn't happen: the P2P peer id has no device component, so all of a user's
devices register under the same id and **compete** for it — only one holds the
channel, only one gets the instant nudge. The others still work (CRUD is the
source of truth; the message lands on the next read), but they don't get the
*instant* pop. This doc makes up to three of a user's devices live at once.
Decision: **D89**.

## The problem: one id, N devices

The P2P peer id is `${provider} ${user} ${site} ${label}` (`rtc/index.js`
`peerId`). Today `label` is fixed (`web10-social`), so a user's phone and
laptop both register as `web10.app alice web10 web10-social` — the *same* id.
PeerJS routes an inbound connection to one connection per id, so when a friend
dials that id, exactly one of the user's devices answers. The other is "competed
off." Nothing is lost — the message is durable in the DM group and the non-nudged
device catches up on its next read — but the instant nudge reaches one device,
not all of them.

## The model: bounded device slots (1, 2, 3)

Give each device its own slot in the label: `web10-social-{slot}`,
`slot ∈ {1, 2, 3}`. A user's devices spread across the slots; a friend dialing
the user hits all three and reaches every live device. The bound (3) is
deliberate — it caps the fan-out at a small, dumb number and degrades gracefully
past it.

| slot | who holds it |
|---|---|
| `web10-social-1` | the first device to sign in |
| `web10-social-2` | the second |
| `web10-social-3` | the third |
| (none) | a 4th device — all slots claimed → **CRUD-only** (no instant nudge, still works) |

**Why a bound and not "as many as you want":** the dialer fans out to every slot
of the recipient. Unbounded slots = unbounded dead dials per message + an
unbounded presence-aggregation set. Three covers the real case (phone + laptop +
tablet) and the 4th device degrades to the same guarantee a DM already has when
P2P is off.

## The peer id

`label` changes from the fixed `web10-social` to `web10-social-{slot}`.
Everything else is unchanged — the id is still `${provider} ${user} ${site}
${label}`, the signaling server still routes by id, `certify` still gates the
connection. The node and the relay are untouched (D60 — the slot is a client-side
presence concept, not a node concept; "would a notes app use this?" — yes, the
same slot model, different label prefix).

## The claim: how a device picks its slot

A device is not *told* its slot; it **probes and takes the first free one.** On
sign-in (`initP2P`), the device probes slots 1 → 2 → 3 in order and claims the
first that is free.

**The probe = connect + ping + wait for a pong.** The device opens an outbound
data connection to `web10-social-{slot}` and sends a ping:

| probe outcome | meaning | action |
|---|---|---|
| connect fails (no such peer) | slot is **free** | claim it — register my peer as `web10-social-{slot}` |
| connect + pong within timeout | slot is **held** (live) | try the next slot |
| connect + no pong within timeout | slot is **held but zombie** (the holder's socket is half-dead) | **steal** it — claim it (kicks the zombie) |

This reuses the existing liveness machinery (`MISSED_PINGS_TO_OFFLINE`, the ping
timeout) — a zombie slot is exactly the "ping that got no pong" case the presence
system already handles.

**Holding a slot** = being the registered peer for that slot id. The slot is held
for as long as the device's WebSocket to the signaling server is open. No
separate keep-alive is required to *hold* it; the existing ping loop keeps the
*channel* warm so a send to that slot is instant.

## The nonce: telling my slot from a stranger's

A raw pong confirms liveness but not *identity* — a device probing a slot can't
tell "this is my own (re)claim" from "a stranger took it." Each device carries a
**device nonce** (a random id, generated on a fresh claim, persisted in
`localStorage`). The ping/pong frames carry it:

```
ping: { __p2p: 'ping', nonce }
pong: { __p2p: 'pong', nonce }   // echoes the nonce it received
```

The nonce is what makes the edge cases clean (below). It is **not a secret** —
it's an identity tag, not a credential. Anyone can read it; it only matters to
the device that generated it.

## The state machine

The slot a device holds is persisted in `localStorage` (`p2pSlot`). On every
`initP2P`:

1. **No slot stored** (first sign-in on this device) → run the **claim scan**
   (probe 1 → 2 → 3, take the first free). Store the slot.
2. **Slot stored** (reload / return) → **reclaim**: probe *that* slot.
   - pong echoes my nonce → I still own it (my old connection answered) → keep it.
   - no pong (zombie or freed) → re-claim it (take it back).
   - pong with a *different* nonce → a stranger took it while I was gone → run
     the claim scan for a new slot.
3. **Clean sign-out** (`teardownP2P`) → **release**: close the peer (the slot
   frees immediately, not after the TTL) + clear the stored slot.

**Eviction (a device dies mid-session):** the dead device stops holding its slot
the moment its socket closes. If the close is clean, the slot frees at once. If
the socket is a zombie (network drop, no close frame), the slot stays "held"
until a prober's ping gets no pong → the prober steals it (the zombie-steal
above). Worst case: a slot is held-by-a-zombie for one ping timeout before it's
stealable.

## The dialer: fan out to all three

`sendP2P(toProvider, toUsername, payload)` dials **all three** of the
recipient's slots — `web10-social-1`, `-2`, `-3` — fire-and-forget. The live
devices answer (the nudge lands, they re-read the conversation); the dead slots
just fail to connect (no registered peer) and are a no-op. The cost is two dead
dials per message when the recipient is on one device — accepted, because the
alternative (a slot registry) is more moving parts for a latency nicety.

The same fan-out applies to **notifications** — they ride the same `sendP2P`
seam, so fixing it once covers DMs + notifications.

## Presence: any slot live = online

The recipient's online state is the **OR over their three slots** — the green
dot shows if *any* of `web10-social-{1,2,3}` is live. The sender's ping loop
pings all three slots of a tracked recipient (keeping all three channels warm +
confirming liveness); a slot that pongs marks the recipient online, and the
recipient flips offline only when *all three* slots are dead. The ping traffic is
3× the old per-peer amount — bounded, and only for recipients the sender is
actually tracking.

## The 4th device

A device that finds all three slots claimed (live, or zombie-but-unstealable)
takes **no slot** → it is **CRUD-only**: it reads/writes normally, just without
the instant nudge. It is not an error; it degrades to the same guarantee a DM has
when P2P is off. If a slot frees later (a device signs out), the 4th device picks
it up on its next `initP2P` (a refresh, or the next sign-in).

## What it costs

- **Two dead dials per message** (the recipient's two empty slots). Fire-and-
  forget, no added latency on the sender's send path (the CRUD write already
  happened; the dials are best-effort).
- **3× ping traffic** per tracked recipient. Bounded at 3, only for tracked peers.
- **A claim race** when two devices sign in simultaneously and both see slot 1
  free. Resolved by the nonce + the next probe: the second device's follow-up
  probe gets a pong from the first → it moves to slot 2. Worst case is a one-
  probe-interval overlap, not a data loss.

## Security invariants

- **I3 is untouched.** A slot is a *presence* concept, not an *access* boundary.
  Reading a DM still requires group membership (the D58 gate); a slot only decides
  *which device gets the nudge*, never *whether a message is readable*. A
  non-member dialing any slot still can't read the conversation.
- **The nonce is not a secret.** It's an identity tag for slot ownership, not a
  credential. It grants nothing; it's not in any token, not sent to the node, not
  a signing key.
- **A slot is not a grant.** Holding slot 1 doesn't let a device read anything it
  couldn't already read with its token. The slot is purely a P2P routing label.
- **The bound is a DoS limit, not a security wall.** Capping at 3 bounds the
  fan-out; it doesn't gate access. A user with 4 devices just has one that's
  CRUD-only.

## What this is not

- **Not E2E device linking.** This is the *presence/nudge* layer for the no-E2E
  world (D41). It has nothing to do with D15's device-cert / QR-pairing /
  key-sync model, which remains the future *encryption-layer* design. A slot
  doesn't prove a device is "the same user" cryptographically — the token does
  (the signaling server still `certify`-gates every connection, I2).
- **Not a node change.** The slot is client-side (`src/data/p2p.ts` + the SDK's
  rtc label). The signaling server routes by id as it already does; the relay is
  untouched. D60-clean.
- **Not unbounded.** Three slots, full stop. A 4th device is CRUD-only.
- **Not a server-assigned slot.** The client probes and claims; the server is not
  the source of truth for slot assignment. (If the client-side race proves flaky
  in practice, the fallback is server-assigned slots — the signaling server hands
  out the next free slot on connect. That's more invasive and couples the count
  to the server, so it's the plan B, not the plan.)

## Reference

- The P2P relay (TURN) this rides on: `../p2p-relay.md`
- The P2P seam this modifies: `../../../../marketing/web10-social/src/data/p2p.ts`
- The peer id + the signaling auth: `../../../../sdk/dist/rtc/index.js`
- The DM model (CRUD is truth, P2P is the nudge): `../social/group-chat.md`
- The E2E device model this is *not*: `../../../strategy/decisions.md` (D15, D41)
