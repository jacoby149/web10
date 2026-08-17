# GLOSSARY — web10 vocabulary

web10 has a lot of domain-specific terms, several of which are ordinary words
with special meaning. This is the shared dictionary. When in doubt, the code
in `api/app/main.py` and `api/app/mongo.py` is the source of truth.

## Core data model
- **node** — one running web10 deployment (an `api/` instance + its DB, and
  in the future the bundled UI + social app). Identified by its **provider**
  domain. A person, a community, or a celebrity can run one.
- **provider** — the node's identity/domain (e.g. `api.web10.app`). Half of
  a user's global identity.
- **user / collection** — each user owns one MongoDB collection, named by
  their username. Their whole life on the node lives there.
- **service** — a namespace within a user's collection (e.g. `posts`,
  `contacts`, `mail`). Every record declares its service. Apps read/write
  specific services. Roughly "a table" or "an app's data area."
- **record** — one document, stored as `{service, body}`. `body` is the
  user-facing content; the wrapper is internal.
- **star record (`*`)** — the special account record in the `services`
  service. Holds password hash, credits/space quotas, phone, stripe ids.
  **Star protection** blocks normal CRUD from reading/writing it.
- **services record** — a terms/ACL record (its service is `services`).
  Defines who may access a given service and how.

## Identity & auth
- **username + provider** — global identity, like an email address
  (`alice` @ `web10.app`). Whitelists must match BOTH.
- **token** — a JWT carrying `username, site, target, provider, expires`.
  Apps act using one. Scoped and time-limited.
- **site** — the origin (app) a token was minted for. Used in cross-origin
  and mint checks.
- **target** — the provider a token is intended to act against.
- **mint** — issue a new (usually lower-privilege) token from an existing
  one. See `can_mint` / `create_web10_token`.
- **certify** — verify a token is valid and unexpired (`certify`,
  `certify_with_remote_provider`).
- **is_permitted** — the authorization gate: given a token + user + service +
  action, decide yes/no using the terms records.
- **terms / contract** — the user-owned access policy for a service:
  `cross_origins`, `whitelist`, `blacklist`. Editable by the user (the
  Contracts UI). The ACL is data the user owns.
- **cross_origins** — regex patterns of sites allowed to act cross-origin.
- **CORS_SERVICE_MANAGERS** — trusted first-party origins (the auth UI) that
  can manage service terms on a user's behalf.
- **anon** — the anonymous pseudo-user/token for public access.

## CRUD & queries
- **the 4 verbs** — create/read/update/delete on `/{user}/{service}`.
  NOTE: read uses HTTP **PATCH** (so the query can be in a secure body).
  This leaves all GET routes free for serving UI.
- **q_t / u_t** — query/update transformers that prefix user field names to
  `body.` so user input can't name protected fields. A security boundary.
- **aggregate (the 5th verb)** — planned: sandboxed MongoDB aggregation so
  devs get real query power without breaking scope (plan.txt phase 6).

## Quotas (operator-set, not user-facing billing)
- **credits / space** — operator-set per-user quotas on the star record.
  Credits = rate/abuse throttle. Space = storage cap (also caps import
  storage from exporters). **charge** increments spend per request;
  **replenish** resets monthly. Set by the node operator via policy config
  (setup/admin panel), not by any user subscription.
- **dev pay** — Stripe Connect flow for the creator economy: memberships,
  tips, and marketplace rails. Creators charge their audience; web10 takes
  a percentage cut (`stripe.py`). Stripe is NOT used for user-facing plans
  or subscriptions.

## Vision-era terms (not all built yet — see plan.txt)
- **lens** — an app is a "lens" over data the user owns. (The **lens
  record** — feed algorithm + experience config as a user-owned record,
  editable via an LLM chatbox — was cut from the roadmap to `later.md`
  in D20; the feed ships chronological + a sort dropdown.)
- **inbox pattern** — feeds via fan-out-on-write: friends' nodes deliver
  posts into a collection you own, so reading your feed is one local query.
- **zero-knowledge hosting** — the node stores ciphertext; keys live on the
  user's phone; the operator *cannot* read private content.
- **trust splitting** — key backups live with a party (Drive/Dropbox)
  separate from the node that holds the ciphertext. No single party can read you.
- **wallet** — the keychain app on the phone (grows out of
  `mobile/encryptor`): one master seed, HKDF-derived identity + per-service
  keys, received grants. Root of trust for all the user's devices.
- **keyring** — the wallet's generic key API (D18): named keys (any string,
  like service names), a small closed verb set (mint / rotate / wrap /
  unwrap / encrypt / decrypt / sign / verify / list / handout). Revoke is a
  composition, not a primitive. Persists only as `{service:"keys"}` records.
- **device linking / device cert** — a companion device (laptop) gets its
  own keypair, provisioned once from the phone over P2P WebRTC; the phone
  signs a device cert with the identity key. After linking the companion
  encrypts/decrypts alone — traffic never proxies through the phone (D15).
- **audience key / epoch** — the symmetric key for a sharing circle
  ("friends", "close friends", a group), versioned by epoch. Revoking a
  member = bump the epoch and rewrap to everyone else (D16).
- **grant** — an audience key HPKE-wrapped to one member's public key,
  stored as a signed, terms-gated record in the owner's collection, with an
  optional node-enforced `expires`. "Who can see what, until when."
- **key manifest** — a public self-signed `{service:"keys"}` record listing
  a user's current public keys, device certs, and epoch numbers — what
  friends fetch to encrypt *to* you (a JWKS-for-people / prekey bundle).
- **live handout** — the sensitive tier: keys are never stored, handed out
  P2P per-read by the phone; revoke = stop answering.
- **wapi.js** — the JS SDK apps are built with (`sdk/`).
