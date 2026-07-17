# decisions.md — why the big calls were made

A lightweight decision log (ADR-style). Each entry: the decision, why, and
what it rejects. Add to the TOP as new decisions land. This exists so
parallel agents and future-you don't re-litigate settled questions. Details
and task breakdowns live in `plan.txt`.

Status legend: [decided] intent set · [in-progress] · [open] still debating.

---

### D12 — Repo trio: api / ui / marketing-ui; docs live in marketing-ui [decided]
`home/` + `docs/` merge into **`marketing-ui/`** — web10 Inc's website as one
site (landing + dev docs, one build), because docs are a key part of a SaaS
marketing site. With phase 2's auth2→`ui` rename, the repo reads clean:
`api` (the node), `ui` (the node's admin/consent surface), `marketing-ui`
(Inc's site). Everything stays in this monorepo by choice — one dev, atomic
commits — multi-repo is a later option, not a goal. Doc surfaces split three
ways: generated OpenAPI ships with the api (every node self-documents),
protocol spec + conventions stay in-repo as versioned markdown/JSON Schema
(the conformance suite tests those files), the rendered docs site is
presentation inside marketing-ui (js-native framework: Starlight or
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
