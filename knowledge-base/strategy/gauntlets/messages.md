# Messages gauntlet — DM, P2P, presence

[← back to the gauntlet doctrine](./README.md)

Messages are DMs: a `posts` doc in a 2-member DM group (`dm-{a}-{b}`), with
real-time delivery over WebRTC P2P (the fast path) and CRUD (the source of truth).
Presence is the P2P peer being open (Online/Offline). The opt-out (Settings →
Real-time Messages) tears down the peer — CRUD-only, shown offline.

This is the most timing-sensitive surface (P2P is async, presence is a TTL
sweep). The gauntlet drives the DM lifecycle with the truth asserted, and it is
the one surface where the P2P fast path and the CRUD source of truth must agree.

## The surface

- **Route:** `/messages` (the conversation list + the open conversation).
- **Testids:** the conversation list, the open conversation, the message input,
  the send button, the presence dot (Online/Offline), the "Real-time" status chip.
- **The truth:** the DM group's `posts` docs (the messages, by the DM group), the
  P2P connection state (the peer open/closed), the presence (the other party's
  last-seen).

## The state machine

```
cold (two users, no DM)
→ user A opens a DM with B     the DM group is created (2 members)
→ A sends a message            the message is in the DM group (CRUD) + pushed (P2P)
→ B receives (P2P)             B's open conversation shows the message (fast path)
→ RELOAD (B)                   the message persists (CRUD source of truth)
→ A sends a 2nd message        B receives it
→ B replies                    A receives it
→ A goes offline (peer closes) B's presence dot flips Offline (the TTL sweep)
→ A comes back online          B's presence dot flips Online
→ RELOAD                       the conversation + presence persist
```

**The CRUD-truth assertion (the load-bearing one):** every message is asserted in
the DM group's `posts` docs (the source of truth), not just "the message rendered
in the UI." A message that renders via P2P but isn't in the DM group is a bug the
UI-only assertion misses. The P2P fast path and the CRUD source of truth must
agree.

**The presence truth:** the presence dot is the P2P peer state. The gauntlet
asserts the dot flips Online when the peer opens and Offline when it closes (the
TTL sweep backstop for missed close events).

**The reload truth:** a reload re-reads the conversation from the DM group (CRUD),
not from the P2P cache. The gauntlet asserts the conversation survives a reload
(the messages are in the DM group, not just the P2P buffer).

## The forks

- **Send:** the send button (the reference). (The keyboard Enter-to-send, if
  present, is a fork.)
- **Open:** tapping a conversation in the list vs. the deep-link (if present).
- **Real-time on/off:** the Settings toggle — P2P on (the fast path) vs. P2P off
  (CRUD-only, shown offline). Drive both.

## The truth fields

- **DB:** the DM group's `posts` docs (the messages, in order); the DM group's
  membership (the 2 members).
- **UI:** the conversation's message list, the presence dot, the "Real-time" chip.

## The anti-tests

- **P2P off (CRUD-only):** with real-time off, a message is delivered via CRUD
  (the re-read on open), shown offline — not lost.
- **Missed close event:** the peer closes without a clean close event → the TTL
  sweep flips the presence Offline (the backstop).
- **Reload with no P2P:** a reload with the peer closed re-reads the conversation
  from CRUD (the messages are there, the presence is Offline).
- **Empty conversation:** a DM with no messages → the designed empty state.

## The multi-user dimension (Rule 4)

- **Cross-user (browser, 2 contexts):** user A sends a DM to B; user B (separate
  context) → the message appears in B's conversation (the P2P fast path). **Reload
  B** → the message persists (the CRUD source of truth). The P2P and the CRUD must
  agree — a message that renders via P2P but isn't in the DM group is a bug.
- **The presence at 10 peers (browser, 10 contexts):** 10 users, one "hub" user
  with 9 peers → the hub's presence list shows all 9 Online; one peer closes →
  that peer flips Offline (the TTL sweep), the others stay Online.
- **The DM isolation at scale (API floor, 10 pairs):** 10 pairs of users in DMs →
  each conversation is isolated (no cross-talk — a message in A↔B's DM does not
  appear in A↔C's DM).

The cross-surface scale tests live in [scale.md](./scale.md).

## The bites

1. **API floor** — the DM messages via raw CRUD, the DM group's `posts` asserted
   after each send.
2. **Browser gauntlet — DM round-trip** — A sends → B receives → B replies → A
   receives, the CRUD truth asserted at each step + across a reload.
3. **Browser gauntlet — presence** — the dot flips Online/Offline with the peer.
4. **Browser gauntlet — real-time off** — the CRUD-only path (the opt-out).

Note: the P2P tests are the slowest and most timing-sensitive in the suite. They
run with a longer timeout and are the first to flake under CI load — the
diagnostic dump (the two-sided console + the P2P connection log) is essential
here.

## The P2P fast path (now covered)

The P2P (WebRTC) fast path — the one the gauntlet's `messages.spec.ts` originally
left as a "stretch" (timing-sensitive, "NOT covered here") — is now e2e-proven by
the standalone [`social-p2p.spec.ts`](../../../e2e/tests/social-p2p.spec.ts)
(3.130.0). It drives the REAL app (not the demo) with two live accounts in two
separate browser instances + the mDNS flag, and witnesses, in the DOM with no
reload on the recipient: a send → the recipient's notification badge pops to 1
(the D69 nudge) + the message lands in the recipient's open thread (the
`onP2PInbound` re-read). The "no reload" is the load-bearing assertion — the app
has no polling, so P2P is the only mechanism that can update the recipient's DOM
after a send. The presence dot + the real-time-off (CRUD-only) forks remain the
gauntlet's own territory (bites 3-4).
