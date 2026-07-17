1.0.32 || 17.07.2026
Removed chrome-extension/: browser extension was too high a friction
bar for mainstream adoption. it was fully isolated — zero external
references, no CI/CD, no backend integration, no docs mentions.

1.0.31 || 17.07.2026
marketing-api: new FastAPI service — ZIP import pipeline (server-side
streaming parse, validate, dedup, batch write to user's node), analytics
endpoints (pageview tracking, funnel events). Exporter UI moved from
exporters/ into marketing-ui/ (now talks to marketing-api via job polling
instead of browser-side ZIP parsing). Instagram/Facebook/YouTube mappers
ported to Python. Legacy home/ and exporters/ dirs deleted, home service
removed from docker-compose.yml.

1.0.30 || 17.07.2026
web10-social: CRM and Mail integrated as sub-apps in the social super
app. CRM (Rolodex) has contact CRUD, color-coded priority, per-contact
notes, search, and color filtering. Mail has compose, inbox, send/receive
via the mail web10 service. Both use the existing wapi adapter with new
crm-contacts, crm-notes, and mail service registrations. 35 new vitest
tests (20 CRM, 15 Mail). Old standalone crm/ and mail/ folders removed.
Shared mock factory (mockAppInterface.ts) created for all test files.

1.0.30 || 17.07.2026
marketing-ui: new project — consolidated home/ + docs/ + App Store into
one marketing site (Vite + React 19 + TS + Bun + react-router). Home page
rebuilt from home/index.html (hero, features, stats, team, footer). Docs
page renders docs/ markdown via remark. App Store moved from ui/ to
marketing-ui/ (public-facing app discovery belongs on the marketing site,
not inside the node's auth UI). ui/ default mode changed from "appstore"
to "contracts"; AppStore component, appListingInterface, mockAppData, and
related state removed from ui/.
>>>>>>> origin/dev

1.0.29 || 16.07.2026
plan: added phase 2.5 — the ui makeover. retire the homemade
rectangles-npm framework from every ui (ui/, web10-social/), replace
with a mainstream stack (tailwind + shadcn/ui as default candidate),
plus a story-first product design pass (shared design tokens,
narrative screens, the M0 demo as the acceptance bar). queued as
B2.5 (ui/) and D2.5 (web10-social) in parallel execution.txt; B2.5
sequenced before B3/B4 so wizard + admin panel are built on the new
stack.

1.0.27 || 16.07.2026
Lane D5 — multi-platform social import engine (Instagram, Facebook, YouTube):
  - exporters/src/: full implementation — zip parsing (@zip.js/zip.js),
    platform detection, schema mapping, AJV validation, wapi batch writer,
    import engine orchestration (parse -> map -> validate -> write)
  - Instagram mapping: posts (text, media, comments, tags, mentions,
    location), profile, follows/contacts from Meta takeout JSON
  - Facebook mapping: posts (text, privacy, location, attachments),
    photos (dimensions, description, privacy), friends list, comments
  - YouTube mapping: videos (title, description, duration, stats,
    thumbnails, privacy), comments (threaded replies), channel profile
  - React UI: platform selector cards, per-platform guided takeout
    checklists (6 steps each), drag-and-drop ZIP upload, live progress
    bar, per-service write summary table, error details
  - 57 tests (15 Instagram, 18 Facebook, 14 YouTube, 10 validation)
  - Vite + Bun + React 19 + TypeScript, multi-stage Dockerfile

1.0.28 || 16.07.2026
web10-social: full TypeScript + Vite + Bun modernization (Lane D):
  - migrated from CRA 5 (react-scripts) to Vite 6 + bun + TypeScript
  - React 18 -> 19, removed dead deps (install, npm, react-router-dom,
    react-usestateref, web-vitals, react-scripts, axios)
  - all 21 components, 5 interfaces, 8 mocks converted to .ts/.tsx with
    full type definitions (AppInterface, Post, Message, Contact, etc.)
  - eliminated giant mutable I={} anti-pattern — proper React hooks with
    typed return objects
  - fixed: Math.random(1e15) no-op, var declarations, loose equality,
    index-based keys, stale closures, defaultValue on controlled inputs,
    broken typing-indicator ternary, dead mock-data in real interface
  - removed vendored Bulma (~100 files), uses ChatScope styles
  - vitest suite: 137 tests across 12 files

1.0.27 || 16.07.2026
mobile/encryptor: complete rebuild — foundation, wallet/keyring, UI, and tests.
Expo 44->52, React 17->18, React Native 0.64->0.76, bun package manager.
crypto.js: pure ESM crypto core (no Expo deps) — HKDF-SHA256 derivation,
ed25519/x25519 keypairs, xchacha20-poly1305 encrypt/decrypt, grant wrap/unwrap,
device cert create/verify. wallet.js: SecureStore-backed persistence layer
wrapping crypto.js. React Navigation v6 tab-based UI: SetupScreen, WalletScreen,
KeysScreen, GrantsScreen, SettingsScreen. 55 bun tests across 8 files covering
helpers, key derivation, keyring verbs, signing, encryption, grants, device
certs, lifecycle — all green. Deleted obsolete encryptor.js and CodeInput.js.

1.0.26 || 16.07.2026
Phase 2 completion — auth2 parity, rename to ui, delete legacy auth/:
  - auth2 -> ui/: full rename, docker-compose updated (auth2 context -> ui,
    legacy auth/ service + volumes removed)
  - Interface.tsx: complete API integration — wapi/wapiAuth wired from
    authAdapter, setStatus for status messages, SMR listening via
    initAuthenticator, servicesLoad to load services from API, changeTerms
    to persist service updates via wapi.update, submitSIR for new service
    creation, purgeSMR for request denial, sendToken for OAuth flow,
    deleteService/wipeServiceData for destructive operations, sendCode/
    verifyCode for phone verification, changePassword, changePhoneNumber,
    getPlan for live subscription display, Stripe redirect methods
    (manageSpace, manageCredits, manageSubscriptions), DevPay methods
    (manageBusiness, businessLogin)
  - OAuth flow: OAuthBanner component in App.tsx detects referrer, shows
    pending SMRs, auto-sends token on login when no requests pending
  - RequestPage: full rewrite — renders pending SIRs/SCRs from I.SMR,
    Approve/Deny buttons wired to I.submitSIR/I.purgeSMR
  - ContractViewer: delete terms and wipe data with confirmation dialogs
    (previously [TBD] placeholders calling non-existent methods)
  - Subscription: live plan data from I.getPlan() replacing hardcoded values
  - VerifyPhone: sendCode/verifyCode wired to wapiAuth, code state tracking
  - ChangePhone: wired to I.changePhoneNumber(password, phone)
  - ChangePassword: wired to I.changePassword(current, new, retype)
  - DevPay: wired to I.manageBusiness() and I.businessLogin()
  - Form inputs (Phone, ConfirmationPass, NewPassword, ReTypeNewPass):
    accept value/onChange props for controlled usage in Settings
  - MockInterface: full parity with Interface shape (all new methods stubbed)
  - Tests: 44/44 passing (updated login/signup mode assertions: appstore ->
    contracts, the authenticator's post-login default)
  - auth/: deleted (legacy CRA React 16 app, superseded by ui/)
1.0.25 || 16.07.2026
Phase 5 media service (greenfield, Lane C):
  - media/: new FastAPI service with presigned S3 upload URLs, short-lived
    presigned read URLs (60s expiry, per-read issuance, logged per D14),
    metadata record creation in user's collection (ordinary {service:"media",
    body} per D13), and media record listing/deletion
  - Auth mirrors api's is_permitted/certify logic against the "media" service;
    terms/ACLs are the single source of permission truth with zero new concepts
  - S3 config supports any S3-compatible backend (MinIO self-hosted, R2, B2,
    Wasabi) via env vars; MinIO added to docker-compose on a dedicated
    media-network
  - pyproject.toml (uv, python 3.12, boto3), Dockerfile, models.py (upload,
    read, metadata schemas), settings.py, mongo.py (terms lookup, CRUD),
    auth.py (token verify, is_permitted), main.py (5 endpoints)
  - docker-compose: media service (port 6001, media.localhost) + minio
    (port 9000, console 9001) with minio-data volume

1.0.24 || 16.07.2026
agent task-status hygiene (agents were re-attempting merged work):
  - parallel execution.txt: lane queues now carry live status markers —
    [✓ x.y.z] merged (A1, B1, D1 ticked with their changelog versions),
    [~] in flight (C1, D3), [ ] open; wave 0 marked PARTIAL (unit layer
    landed in 1.0.21, endpoint permission-matrix suite + CI still owed);
    rule 3 extended: tick your lane item in this file on merge; stale
    "suggested first board" replaced with a dated current board
  - added AGENTS.md: orientation entry point for non-Claude agents
    (codex/qwen read AGENTS.md, not CLAUDE.md) — points to CLAUDE.md and
    states the check-before-you-start + tick-on-finish rules; QWEN.md
    pointer added too (Qwen Code's default context file)
  - added .conductor/settings.toml with a repo-wide general prompt
    reminding conductor agents to check done-status before starting
  - CLAUDE.md: new "check it isn't already done" convention; changelog
    convention now includes ticking the parallel execution.txt lane

1.0.23 || 16.07.2026
plan: phase 11 gains "the keyring api" — the record-model discipline applied
to keys: user-named keys (audience = any string, like a service name), cheap
one-call minting (hkdf from the master seed), principals are pubkeys not
usernames, wrap targets are pubkeys OR other named keys (membership, nested
circles, and backup become the same verb), a small closed verb set with
revoke as a composition, {v, suite} version ids on every wire format, a
no-policy-in-keys scope guard, and a futureproof checklist that gates the
design review (person / circle / circle-of-circles / single record / whole
service / llm agent on timed grant / device / hls stream / multi-admin
group / node migration).
decisions: D18 — keyring is generic like the record model; named keys +
closed verb set; node grows zero key-specific endpoints.
glossary: keyring.

1.0.22 || 16.07.2026
plan: phase 11 (e2e encryption) fleshed out from sketch to full design —
phone-as-wallet key hierarchy (one master seed, HKDF-derived identity +
per-service keys, key manifest record), WhatsApp-Desktop device linking over
P2P WebRTC (companions encrypt/decrypt alone, traffic never proxies through
the phone), envelope encryption with audience keys + epochs, layered
revocation (node gating instant / epoch rotation forward / optional
re-encrypt), node-enforced timed grants, media double door (presigned URL +
key), backup/recovery via trust splitting, honest operator-metadata section.
also flags rtc's unsigned-decode + trust-a-200 check as the I1 bug in
miniature (gets the JWKS fix before carrying keys).
decisions: D15 (multi-device: phone is root, linked companions, no
phone-proxying), D16 (revocation layered: node gating + epoch rotation;
timed access is the node's clock, not magic keys), D17 (crypto suite pinned
to standards — X25519/Ed25519, HPKE, XChaCha20-Poly1305, Argon2id, MLS as
graduation path; no web3, no invented crypto).
glossary: wallet, device linking / device cert, audience key / epoch, grant,
key manifest, live handout.

1.0.21 || 16.07.2026
unit test infrastructure:
  - api: added pytest suite (118 tests) covering mongo.py transformations
    (q_t, u_t, to_gui, to_db, star_found, get_approved, is_in_cross_origins),
    main.py auth logic (kosher, can_mint, certify, decode_token, is_permitted),
    models.py pydantic schemas, and web10records.py factories
  - auth2: added vitest + @testing-library suite (config, contractInterface,
    mockInterface, mocks) with jsdom environment and setup file
  - sdk: added vitest suite (48 tests) covering wapiInit (token management,
    CRUD guards & HTTP calls, peerID, authListen, SMR, P2P init, dev pay)
    and wapiAuthInit (login, signup, changePass/Phone, send/verify code,
    Stripe mgmt endpoints, SMRListen, sendToken, mintOAuthToken)
  - review fixes: gitignored api/*.egg-info build artifacts, removed a
    broken/unused conftest fixture and an ineffective import.meta stub,
    tightened a tautological is_permitted assertion, moved
    @testing-library/dom to auth2 devDependencies
  - scope note: this is the UNIT layer only (mocked DB, no HTTP).
    outstanding endpoint-level tests (FastAPI routes, star protection,
    metering, twilio/stripe) are itemized in plan.txt "testing:"

1.0.20 || 16.07.2026
D1 docs: apply review fixes to protocol-spec.md — cross-origin bypass is on
username=="anon" (not site); _id is intentionally queryable (only service is
protected); token-to-token minting checks the submission token's site; array
pull requires a top-level PULL:true flag; reads/deletes on `services` are
unmetered; verify-phone error string matches the code exactly (trailing
period); planned aggregate endpoint is POST, not GET (GET can't carry a body).
D1 docs: protocol-vs-profile layering — conventions.md now opens with a scope
note (application profile, NOT protocol; nodes never enforce these schemas;
only `services` and `*` are reserved); `service` removed from all schemas in
docs/schemas/ and inline (the service name is the URL path, not a record
field, so real wire records now validate); new additive-only Versioning rule;
schemas validate exporter (P9) / killer-app (P8) output while the conformance
suite tests protocol-spec.md only; follows convention now names the terms
whitelist (not cross_origins) for cross-node inbox delivery; plan.txt D1 and
phase-8 wording aligned ("real interop work").

1.0.19 || 16.07.2026
plan: new LATER item — schema contracts: opt-in, per-service schema enforcement
via a "schema" field on the service's terms record. Node stays generic (runs
whatever schema it's handed, like whatever ACL it's handed); no contract means
no validation. Notes the open design questions (partial updates, grandfathered
records, additive-only evolution) and flags it as a candidate to promote into
phase 6 alongside the update-widening work.

1.0.18 || 16.07.2026
D1 docs: protocol spec (docs/protocol-spec.md) — full specification of the web10
protocol derived from the codebase: data model (user collections, {service, body}
envelope, field prefixing), authentication (token format, minting, certification,
is_permitted authorization, federation migration plan), CRUD API (create/read/
update/delete with pagination, star protection), metering, error responses,
security invariants (I1-I5), and the planned aggregate endpoint (sandbox,
allowlist, denylist, resource caps).
D1 docs: social conventions doc (docs/conventions.md) + JSON schemas
(docs/schemas/*.json) — standard service schemas for all social apps and
exporters: posts, media, contacts, follows, comments, reactions, profile, inbox,
and lens. Each schema is versioned, loosely-typed (additionalProperties: true),
and includes origin/origin_id fields for imported content coexistence. The
conformance suite and exporters will validate against these files.

1.0.17 || 16.07.2026
decisions: D13 — media fits the record abstraction: "service" stays the data
namespace, no /{user}/{service}/{collection} restructure; media metadata is an
ordinary {service:"media", body} record so terms/ACLs apply unchanged.
decisions: D14 — media reads via per-request presigned URLs (30-60s expiry,
issuance logged); check-at-issue-time gap consciously accepted, API-proxy and
per-request auth-proxy alternatives rejected (proxy remains a later
tightening option, not a redesign).
plan: phase 5 read-url and metadata items tightened to carry the D13/D14
specifics (per-read issuance, expiry window, logging, record shape).

1.0.16 || 16.07.2026
plan: CROSS-CUTTING docs gains the missing explanation quadrant — "for
everyone" block ahead of the guides: "what is web10" concept pages (mental
model: node, record, tokens+terms, lens, federation), per-audience why pages
(user / creator-influencer / dev / operator, productizing pitch.txt's
vs-crypto and vs-cloud arguments), and how-it-works diagrams as code
(mermaid over plantuml — starlight/docusaurus render it natively). unlike
guides these aren't milestone-gated: the architecture exists, so they're
writable now and double as the marketing site's core copy.

1.0.15 || 16.07.2026
docs: fix D1 consumer list in parallel execution.txt — (C4, D3, D4) → (C4, D4, D5),
matching the sequencing rule "D1 before C4/D4-schemas/D5" (D3 mobile encryptor
has no D1 dependency)
plan: new CROSS-CUTTING docs section — three doc surfaces, three homes:
generated OpenAPI reference ships with the api (invest in annotations, optional
Scalar UI), protocol spec + conventions live in-repo as versioned markdown +
JSON Schema (conformance suite tests against them), docs/ becomes an MkDocs
Material site (embeds OpenAPI, mkdocstrings, sdk typedoc; no hosted SaaS docs)
plan: phase 7 — home/ + docs/ -> marketing-ui/: inc's website + dev docs as ONE
site (docs are part of a saas marketing site), rebuilt on the ui toolchain
(vite + react + bun), own vhost, never in the node compose; stays in the
monorepo by choice (one dev, lean). repo reads api / ui / marketing-ui.
docs site framework lean updated accordingly: js-native (starlight or
docusaurus) instead of mkdocs, since it lives inside marketing-ui.
decisions.md: new D12 recording the api / ui / marketing-ui repo trio.
plan: docs section simplified — split by audience not tool; adds the missing
user/creator guides (they ARE the saas marketing content, written per
milestone as features ship); dev docs = D1 spec + generated references

1.0.14 || 16.07.2026
phase 0 completion — RTC modernization + docker image rebuild + cleanup:
  - rtc service: node:15 → bun, index.js → index.ts with types, npm → bun,
    added tsconfig.json, updated package.json (web10-rtc, ESM, typescript)
  - auth2/Dockerfile: new multi-stage Dockerfile (bun dev target + static deploy)
  - auth/Dockerfile: node:14 → bun (legacy UI, deprecated in phase 2)
  - api/Dockerfile: already modern (uv, python3.12) — no change needed
  - docker-compose.yml: pipenv → uv, npm → bun, nodemon → bun run dev,
    added "ui" service (auth2), legacy auth shifted to port 3001,
    removed version: "3" (deprecated), renamed rtc volume

  - removed docker-compose-lite.yml, docker-compose-nginx.yml, custom.conf
    (one compose file is enough, people can figure out deployment)
  - removed web10-deploy/ (stale GCP configs, skaffold k8s manifests)

1.0.13 || 14.07.2026
phase 0 typescript migration:
  - renamed all 34 .jsx files to .tsx (React) or .ts (non-React)
  - added global.d.ts for Window.I augmentation
  - fixed dynamic object pattern with Record<string, any> type assertions
  - fixed document.getElementById casts to HTMLInputElement
  - fixed .toFixed().toLocaleString() type error
  - updated index.html entry point to main.tsx

1.0.12 || 14.07.2026
phase 0 auth2 toolchain modernization:
  - migrated auth2 from create-react-app to vite 6 + bun (index.html entry,
    src/main.jsx, vite.config.js, bun.lock; removed react-scripts + package-lock.json)
  - react 18 -> 19; renamed all components .js -> .jsx; vitest replaces jest
  - removed react-inject-env + web-vitals; package renamed auth2 -> web10-ui
  - gitignored auth2/dist/ build output

1.0.11 || 14.07.2026
phase 0 python toolchain modernization:
  - switch to uv for package management (pyproject.toml, uv.lock, removed Pipfile + requirements.txt)
  - python 3.12, fastapi 0.139, pydantic v2, PyJWT 2.13, stripe 15, twilio 9, gunicorn 26, uvicorn 0.51
  - pydantic v2 migration: .dict() -> .model_dump(), Optional[X] -> X | None, ConfigDict(extra="allow") on Token model
  - removed infisical dependency (pyinfisical.py, settings.py integration) — env vars only for secrets
  - pruned dead deps: python-ldap, python-gnupg, systematic, future, secrets (pypi)
  - Dockerfile: slim python3.12 image with uv (no pipenv, no nodejs base, no apt libsasl/libldap)
  - added ruff for lint+format (pyproject.toml config, legacy style issues excluded for now)

1.0.10 || 14.07.2026
added plan.txt : phased roadmap (0-12) — toolchain modernization, documentdb/
  ferretdb switch, unified ui + setup wizard, creator admin panel + analytics,
  media/s3 layer, wapi.js + aggregate verb + mcp, killer social app (first-party,
  in-repo) + the lens chatbox, social exporters, user backups, e2e encryption,
  trust & safety. plus cross-cutting quality/testing/security and milestones M0-M3.
added parallel execution.txt : 4-lane plan for running Conductor workspaces in
  parallel without merge conflicts (lane ownership + wave-0 test seatbelt).
added CLAUDE.md, GLOSSARY.md, decisions.md : agent onboarding + shared context.
documented a CONFIRMED federation security bug : providers don't cryptographically
  validate each other (HS256 symmetric signing) — fix is HS256 -> RS256/EdDSA + JWKS.
established five end-to-end security invariants (I1-I5) enforced by the test suite.

1.0.9
added infisical secrets management.
added pipenv for api python package management.
made the settings.py file have defaults.
made configs managed by .env file.
made CORS_SERVICE_MANAGERS from list to comma sep. strings.
made COST dict env var type multiple env vars.
some use case presentations in the sdk folder.

1.0.8 || 11.10.2023
Made the CHANGELOG
Any time there is an improvement / change to the project, that improvement /
change will go here
1.0.8 is the most recent release!
I don't even remember what I improved from 1.0.7.
That is the exact reason why it is beneficial to have a changelog.
