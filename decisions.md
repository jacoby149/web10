# decisions.md — why the big calls were made

A lightweight decision log (ADR-style). Each entry: the decision, why, and
what it rejects. Add to the TOP as new decisions land. This exists so
parallel agents and future-you don't re-litigate settled questions. Details
and task breakdowns live in `plan.txt`.

Status legend: [decided] intent set · [in-progress] · [open] still debating.

---

### D21 — User billing is stripped; metering survives as operator-set quotas (anti-abuse), and the money screen is in M0 [decided]
Users are never charged (D5: accounts free, paid by the operator's revenue),
so the legacy per-user billing surface (plans, user subscriptions, per-account
Stripe) is stripped from the product. The metering machinery it rode on
(credits/space, `charge()`, the star-record ledger) is NOT deleted — it is
repurposed as node policy: operator-set per-user quotas, where credits =
rate/abuse throttle and space = storage caps (which also solves the
import-storage-lands-on-the-creator gap). Stripe remains for the creator
economy only (memberships, rails, marketplace). Second half of the decision:
the Studio's monetization-menu screen (the rung-0 cards — memberships,
Amazon tag, direct deals) is an M0 deliverable, because the pitch to
creators is money and the demo video must SHOW the money screen, not
describe it. Rejects: charging end users anything, deleting the metering
code (it's the quota system), and shipping an M0 demo whose economics are
a slide instead of a screen.

### D20 — The proposition is creator ownership + no shadow ban; the killer app stands on its own; lens/customizability cut to later.md [decided]
This is a product for influencers, and largely a story business. The pitch
("THE STORY" in plan.txt) has to land as "oh shit... this is the only way":
(1) you already don't own your audience — 1M subs and the video does 300k;
subs are not delivery, and the reach gap IS the shadow ban, visible in your
own analytics; (2) urgency — AI influencers are arriving in volume and the
algorithm has no loyalty to humans; own your persona and channel NOW;
(3) ownership is the only structural defense: the inbox pattern (fan-out on
write) delivers to 100% of followers BY ARCHITECTURE — it can't be quietly
revoked because it isn't a policy; (4) it's a hedge, not an exodus — the home
base is owned, platforms become distribution; (5) it must be THE COOL THING:
Kick/Twitch-grade slick, never fediverse jank (PeerTube, even Mastodon) — if
it looks like a protest app, the pitch dies on the first screenshot.
Consequences: the killer app must stand on its own as a plain good social app
(post, feed, DMs, media); the feed is chronological + a sort dropdown — "no
algorithm" IS the feed feature and costs zero code beyond the inbox pattern.
Feed customizability, preset lenses, the lens record, and the LLM chatbox are
cut from the roadmap to later.md (<5% of users touch settings; retention
comes from defaults; "the customizable social network" was Ello/Vero's pitch
and it doesn't travel). M0's kill test becomes twenty creator pitches, not a
viral consumer video. D19's BYOK architecture stands ready if the chatbox
earns its way back (promotion bar in later.md). Rejects: "own your algorithm"
as the lead pitch, feed customizability as a launch feature, the
consumer-demo wedge as primary distribution, and fediverse-adjacent
positioning/aesthetics.

### D19 — Chatbox LLM is BYOK-only; the key is a wallet secret the phone beams to chosen apps [decided]
The phase-8 lens chatbox never runs on operator-paid inference by default: a
free-signup node exposing a server-side LLM endpoint is a free API proxy, and
the abuse lands on the operator's bill — exactly the surprise cost that kills
hobbyist self-hosting. v1 is bring-your-own-key, held client-side
(localStorage) and calling the provider directly from the browser, so the
node never sees the key or the conversation. Presets (chronological, detox,
close-friends) need zero LLM, so the "own your algorithm" pitch works without
a key. Phase 11 graduates the key into the phone wallet: an e2e-encrypted
record (ciphertext on the node, portable like everything else) that the phone
beams only to the web10 apps the user picks at provisioning — the keyring's
`agent:lens-llm` naming already anticipates this (D18). True revocation is
rotating the key at the provider; device revocation only stops future
provisioning. Node-provided inference may return later as an operator OPT-IN
with hard per-user caps, never the default. The LLM's web10 token stays
scoped to the lens service regardless (I5) — who pays for inference is
independent of what the token can touch. Rejects: operator-pays-by-default,
proxying chat through the node, storing the key as a plaintext record, and
routing every chat call through the phone (D15: the phone is the root of
trust, not a proxy).

### D18 — The keyring is generic like the record model: named keys, a small closed verb set [decided]
The same discipline that made `{service, body}` survive: no hardcoded schema.
Audiences are user-named keys (any string — a circle, a single record, an LLM
agent, an HLS stream), minting is one cheap call (HKDF from the master seed),
and principals are **public keys, not usernames** (humans bind on top via the
key manifest + signatures), so grantees can be friends, devices, agents, or
things that don't exist yet. One composability rule does the heavy lifting:
wrap targets are pubkeys OR other named keys — which makes membership, nested
circles, and backup (seed wrapped under a passphrase key) the *same verb*.
The verb set is small and closed: mint / rotate / wrap / unwrap / encrypt /
decrypt / sign / verify / list / handout; revoke is a **composition**
(terms-drop + rotate + rewrap), not a primitive. Everything the keyring
persists is an ordinary `{service:"keys"}` record, so terms/CRUD/portability
apply unchanged and the node grows zero key-specific endpoints. Every wrapped
blob carries `{v, suite}` ids for crypto agility. Scope guard: keys do keys,
not policy — no roles or ACL language inside grants; authorization stays
terms (node) + possession (crypto). A futureproof checklist in plan.txt
phase 11 gates the design review. Rejects: enum'd circle types,
username-bound grants, a backup-specific subsystem, unversioned wire formats,
and a policy DSL inside the keyring.

### D17 — Crypto suite is pinned to boring standards; no blockchain, no invented crypto [decided]
E2E encryption (phase 11) assembles existing, audited primitives: X25519 +
Ed25519 (identity/devices, HKDF-derived from one master seed), HPKE (RFC 9180)
for wrapping keys to people, XChaCha20-Poly1305 for content, Argon2id for
passphrase-wrapped backups, and Signal-style QR safety numbers for optional
verification. MLS (RFC 9420) is the pre-chosen graduation path when group
size/churn outgrows pairwise wraps. Explicitly rejected: anything web3-shaped
(chains, tokens, "decentralized key registries"), hand-rolled ECDH (the
secp256k1 experiments in `sdk/src/wapiencrypt.js` are a seed, not a
direction), and cryptographically self-expiring keys (without trusted
hardware on every reader they don't exist — timed access is the node's job,
see D16).

### D16 — Revocation is layered: node gating (instant) + epoch rotation (forward) [decided]
Sharing is by **audience keys with epochs** — a symmetric key per circle per
epoch, HPKE-wrapped to each member's public key and stored as a signed,
terms-gated **grant** record in the owner's collection. Revoking someone is
two enforced layers plus an optional third: (1) node layer, instant — terms
drop them, so they can't fetch ciphertext or presigned URLs anymore; (2)
crypto layer, forward — bump the epoch, rewrap to everyone-but-them, so all
future content is unreadable to them even if they obtain ciphertext; (3)
optional lazy re-encryption of history. Epochs are independent random keys
(a derivable hash chain would let old epochs compute new ones). Timed access
= an `expires` field on the grant, enforced by the node's `is_permitted`
machinery + 30–60s presigned URLs (D14); the sensitive tier (live handout
from the phone) gives true real-time control. Honestly stated limit: no
system can make someone un-know a key or unsee content they already
downloaded — Signal/WhatsApp/MLS rotate forward rather than pretend, and so
do we. Rejects: per-friend-per-post wrapping (no revocation unit), DRM-style
expiring keys, and re-encrypt-everything-on-every-unfriend as a requirement.

### D15 — Multi-device: phone is root of trust, companions are linked, traffic never proxies through the phone [decided]
The WhatsApp Desktop model. The phone (wallet) holds the master seed and
identity key; a laptop generates its own device keypair and is provisioned
ONCE over a P2P WebRTC channel (QR pairing secret so the rtc signaling
server can't MITM; rtc stays untrusted by construction). The phone signs a
**device cert** {device pubkey, id, expires} with the identity key and syncs
current audience keys — after linking, the companion encrypts/decrypts alone.
Day-to-day reads/writes on a laptop never route through the phone; the phone
is only in the loop for root operations (link, revoke a device, epoch bumps,
live-handout tier). Device revocation = signed revocation in the key
manifest + epoch bump; any linked device can bless a replacement phone, so
lost phone ≠ lost life. Rejects: phone-as-proxy for all traffic (kills
availability and battery, the original phase-11 sketch implied it), and
server-side device provisioning (node could insert readers).

### D14 — Media reads use per-request presigned URLs with tight expiry [decided]
S3-class stores can't express the terms model per object (bucket policies are
bucket-level, object ACLs are coarse and deprecated). Rather than proxy every
media read through the API to get live terms enforcement, the media service
checks `is_permitted` **at issue time** and returns a presigned URL that is
issued fresh on every read, expires in 30–60 seconds, and is logged on
issuance. This consciously accepts a gap: a presigned URL is
check-once-then-open until expiry — terms revocation inside that window is
not enforced. The window is the safety net, and it's tiny. Rejects: streaming
all blobs through the API (node becomes a media proxy — bandwidth and scaling
cost); a per-request auth proxy in front of S3 (rebuilds the media CRUD
surface we're avoiding). If a real threat model demands live revocation
later, the proxy option remains open as a tightening, not a redesign.

### D13 — Media fits the record abstraction; "service" stays the namespace [decided]
`/{user}/{service}` keeps meaning "a data namespace in the user's collection"
— it is not a running service, and media does not change that. The media
service (a literal running service) gets no new URL hierarchy: uploads and
reads are gated by the same `is_permitted` machinery against
`service="media"`, and each blob's metadata is an ordinary
`{service:"media", body}` record in the owner's collection, so terms/ACLs,
portability, and the user-owns-the-policies story apply to media with zero
new concepts. Rejects: restructuring URLs to `/{user}/{service}/{collection}`
(breaks every existing route and app for a naming itch); renaming "service"
(same churn, no capability gained). If the namespace word still grates later,
that's a docs/glossary fix, not an API fix.

### D12 — Repo trio: api / ui / marketing/marketing-ui; docs live in marketing/marketing-ui [decided]
`home/` + `docs/` merge into **`marketing/marketing-ui/`** — web10 Inc's website as one
site (landing + dev docs, one build), because docs are a key part of a SaaS
marketing site. With phase 2's auth2→`ui` rename, the repo reads clean:
`api` (the node), `ui` (the node's admin/consent surface), `marketing/marketing-ui`
(Inc's site). Everything stays in this monorepo by choice — one dev, atomic
commits — multi-repo is a later option, not a goal. Doc surfaces split three
ways: generated OpenAPI ships with the api (every node self-documents),
protocol spec + conventions stay in-repo as versioned markdown/JSON Schema
(the conformance suite tests those files), the rendered docs site is
presentation inside marketing/marketing-ui (js-native framework: Starlight or
Docusaurus). Rejects: docs inside the node's `ui` (ships Inc's content with
every node); hosted SaaS docs (off-message for a self-hosting product);
separate marketing/docs repos now.

### D11 — Killer app is first-party, in this repo (not a separate repo) [decided]
The social app is the **default lens**: it ships with every node, renders the
operator's ad slots, and embodies the conventions doc. Building it is how the
protocol (aggregate, inbox, lens record) gets discovered, so schema+api+sdk+app
need atomic commits. Lives in `social/`. Demo apps (crm/mail) → `examples/`,
kept in-repo but out of the default compose. Third-party apps stay external —
that's the protocol working. Rejects: apps-in-a-separate-repo (breaks atomic
protocol changes and denies the node a built-in experience).

### D10 — Anti-abuse (phone requirement etc.) is node policy, not hardcode [decided]
Hardcoded phone-required signup is extreme for a small node, reasonable for a
huge one. Signup gates (open/invite/approval/beta/email/captcha/phone) become
a per-node config in the setup wizard + admin panel. Recovery must not assume
SMS. Rejects: one global abuse posture baked into the code.

### D9 — Developers get sandboxed aggregation, not just 4 CRUD verbs [decided]
4 CRUD ops is too weak to build real apps on. Mongo queries are structured
JSON (not string-injectable), so allow (nearly) the full query language and
make it safe by: prepending `$match{service}`+`$replaceRoot` so pipelines
can't escape scope, allowlisting stages, denylisting JS-exec and
cross-collection stages, and capping resources. Rejects: staying at 4 verbs
(bottleneck), and raw unrestricted queries (injection/scope-escape risk).

### D8 — Security invariants are end-to-end and machine-enforced [decided]
Five invariants (I1–I5 in plan.txt) must hold every phase; the conformance
suite tests them so they can't silently rot. Prompted by finding the
federation bug (D7). Rejects: security as a one-time checklist.

### D7 — Federation switches HS256 → RS256/EdDSA + JWKS [decided, in-progress]
CONFIRMED BUG: with symmetric HS256, providers can't verify each other's
tokens, so the code trusts a token's own unsigned `provider` claim + a bare
remote 200 (spoofing + SSRF). Fix: asymmetric signing, per-node keypair,
public keys published at a well-known JWKS URL, offline verification — the
OIDC model. Dual-verify during migration, then drop HS256. Rejects: the
call-the-remote-and-trust-200 scheme.

### D6 — E2E encryption: phone is the keychain, two modes [decided]
Node stores ciphertext; keys live on the user's phone (secure enclave).
Default **wrapped-key mode** (keys wrapped to each friend's pubkey, stored;
friends decrypt without your phone online — scales to thousands of friends).
**Live-handout mode** (key handed out P2P per read) for the sensitive tier.
Key backup is passphrase-wrapped and escrowed with a party separate from the
node (**trust splitting**). Rejects: server-side key custody; phone-online-
required-for-every-read as the only mode.

### D5 — Monetization: influencer nodes, free accounts, 3% rail [decided]
Creators run nodes and monetize (sponsorships/routing); marketing revenue
subsidizes free user accounts; web10 takes ~3% of revenue flowing through its
rails (Square-like, in-the-flow-of-funds, not a self-reported license). Ads
are operator-owned records — curated by architecture; works at audiences of
100 (affiliate/direct) before any ad network. Rejects: user subscriptions as
the primary model; programmatic ad networks as the foundation.

### D4 — Positioning: "WordPress for social media/streaming" [decided]
Open self-hostable software + a managed-hosting/rails company (the Automattic
shape). The customer is the creator/publisher, not the end user — sovereignty
rides along invisibly. Rejects: leading the pitch with crypto comparisons
(the old pitch.txt framing).

### D3 — DocumentDB/FerretDB as the open DB backend [decided]
Keep the Mongo document model + wire protocol (load-bearing: web10's API IS
Mongo query syntax), but support FerretDB/DocumentDB so nodes aren't tied to
MongoDB's SSPL (a real risk for the node-operator business). pymongo connects
unchanged; mostly a `DB_URL` change. Atlas stays a supported option. Audit
`collstats`/`dbstats` (metering) on FerretDB. Rejects: relational stores
(force a central schema — impossible here); Mongo-only (license risk).

### D2 — Modernize the toolchain first (phase 0) [decided]
Stack is ~2019 (FastAPI 0.68, pydantic 1, PyJWT 1.7, React 16/CRA, no TS,
913 dependabot alerts). Move to uv (python) + Bun/Vite/TypeScript (js) before
building features, so everything lands on modern ground. Rejects: building
new features on the old stack.

### D1 — Parallelize execution into 4 lanes for Conductor [decided]
Work splits into api / ui / greenfield-services / docs-apps-mobile lanes with
directory ownership, fed by a wave-0 test seatbelt. See `parallel
execution.txt`. Rejects: linear single-branch execution (too slow for the
scope).
