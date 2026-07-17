# CLAUDE.md — orientation for agents working on web10

Read this first. Then read `plan.txt` (what/why) and `parallel execution.txt`
(how work splits across parallel branches). `GLOSSARY.md` decodes the jargon;
`decisions.md` records why big calls were made so you don't re-litigate them.

## What web10 is
A system for users to **own their data**. Each user gets their own database
collection; every record is `{service, body}`. Apps are stateless frontends
that hold a **scoped, expiring token** and talk to the user's collection over
a tiny CRUD API. The data outlives any app. The long-term vision:
**WordPress for social media/streaming** — open, self-hostable nodes;
creators (influencers) run nodes and monetize; user accounts are free;
web10 Inc. takes a small % of revenue through its payment rails.

## The stack (as of now — being modernized, see plan.txt phase 0)
- `api/` — FastAPI. The node. All data + auth + billing + media. Entry: `api/app/main.py`.
  - Layered (since 1.0.31): `main.py` app init + middleware + router includes;
    `models/` Pydantic schemas; `services/` business logic (auth, mongo, media,
    stripe, twilio, records); `endpoints/` routers (auth, crud, media, payments,
    system); `settings.py` config.
- `ui/` — React admin/consent UI (renamed from `auth2/` in 1.0.26; legacy `auth/` deleted).
- `sdk/` — `wapi.js`, the frontend library apps are built with.
- `api/rtc/` — WebRTC signaling (merged into api, becomes load-bearing for e2e encryption).
- `mobile/encryptor/` — Expo app, the seed of the phone-as-keychain.
- `marketing/` — everything that makes web10 accessible:
    - `marketing-ui/` — web10 Inc.'s site: landing page + docs + App Store + Exporter UI.
        Vite + React 19 + TS + Bun + react-router. Own vhost, never in node compose.
        Dev docs (protocol-spec, conventions, schemas) live in `marketing/marketing-ui/public/docs/`.
    - `marketing-api/` — FastAPI backend for marketing-ui: ZIP import pipeline
        (server-side parse, validate, dedup, batch write), analytics (pageview, funnel).
    - `web10-cli/` — CLI tool for web10.
    - `web10-social/` — the killer app: all-in-one social lens (instagram-shaped,
        video + streaming). CRM and Mail live here as sub-apps (since 1.0.30).

## How the data model works (know this cold before touching mongo.py)
- One MongoDB collection **per user**, named by username.
- Every doc is `{service, body}`; `to_gui`/`to_db` translate for read/write.
- Queries are scoped by `service`; `q_t`/`u_t` prefix user fields to `body.`
  so user input can never name protected fields. This is a security boundary.
- The `services` service holds terms/ACL records. The `*` (star) record holds
  the account (password hash, plan, phone, stripe ids). **Star protection**
  stops CRUD from touching it — never weaken this.

## Auth model (the heart of the product)
- Tokens are JWTs carrying `username, site, target, provider, expires`.
- `certify` verifies a token; `is_permitted` checks the terms records to
  decide if a token may do an action on a user's service.
- Federation: identity is `(username, provider)`, like email. A provider
  vouches for its own tokens; other providers verify via the provider's key.

## SECURITY INVARIANTS — do not break these (see plan.txt for detail)
These are enforced by the conformance/permission test suite. If your change
touches auth, the DB layer, or tokens, run those tests and keep them green.
- I1. A provider verifies ANY token's issuer cryptographically, without
      trusting the token's own claims. (Currently broken: HS256 → RS256 fix
      is in flight. Do not add code that deepens the HS256 assumption.)
- I2. Authorization decisions use only VERIFIED token data — never an
      unsigned decode.
- I3. A request can only touch the addressed user's collection. No
      cross-collection access, ever. (This is why aggregate is sandboxed.)
- I4. Private content is unreadable by the node operator (e2e encryption).
- I5. Every actor (app, agent, llm) acts under a scoped, expiring,
      revocable token. Least privilege.

## Working conventions for parallel agents
- **Check it isn't already done.** Before starting a plan/lane item, check
  the lane queues in `parallel execution.txt` (`[✓ x.y.z]` = merged,
  `[~]` = in flight elsewhere), the `[✓]` ticks in plan.txt, and the top
  of `CHANGELOG.md`. If it's done, say so and pick the next unticked item.
- **Stay in your lane.** `parallel execution.txt` assigns directory
  ownership. Don't edit another lane's files; if you need a change there
  (e.g. `docker-compose.yml`, `settings`), leave a note, don't reach in.
- **Merge small, merge often.** Days-long branches, not weeks.
- **Tests are the seatbelt.** The permission-matrix suite must exist and
  pass before/through the phase-0 dependency upgrades. Nothing merges red.
- **Don't invent crypto or protocols.** Reuse: OIDC/JWKS for federation,
  Signal sender-keys / MLS for group keys, S3 API for blobs.
- **Match the surrounding code** until a phase explicitly modernizes it.
- **Update `CHANGELOG.md`.** Any improvement or change to the project gets a
  line in the changelog (newest entry at top, `version || DD.MM.YYYY`). This
  is a project rule, not a nicety — do it in the same branch as the change.
  If your work completes a `plan.txt` item, tick it there AND tick your
  lane item in `parallel execution.txt` — that file is the parallel
  agents' task board and stale status there causes redone work.
- **Keep the docs true.** If you change the stack, the data model, or the
  auth flow, update `CLAUDE.md`/`GLOSSARY.md` in the same branch. A big
  architectural decision gets an entry in `decisions.md`. Stale orientation
  docs are worse than none.

## Running it
`docker-compose.yml` brings the stack up locally (`*.localhost` vhosts).
The target one-container experience (`docker run … web10/node`) is plan
phase 3 — not built yet.
