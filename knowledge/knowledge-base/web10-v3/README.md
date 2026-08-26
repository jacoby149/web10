# web10 v3 — Core Architecture

This folder holds the finalized, authoritative documentation for web10 v3.

v3 is the core architecture switch: ClickHouse, groups as the primitive, CRUD with groups, auth, social app. Everything here is what we build first.

Everything beyond the core is in `../web10-v4/` — P2P delivery at scale, federation, real-time, advanced SDK, finance, monetization.

## Brainstorm

Work-in-progress ideas, alternatives, and explorations live in `web10-v3-brainstorm/`. When a direction is picked and finalized, it moves here.

## Structure

```
web10-v3/
├── README.md              ← you are here
├── auth/                ← authentication, tokens, consent
│   ├── auth.md            ← JWT auth flow, token structure, ACR
│   └── consent.md         ← the consent experience: two contract types, return run, ideal UX
├── security/              ← security model, invariants, access control
│   └── overview.md        ← invariants I1–I5, two-contract model, blocking
├── sdk/                   ← the JavaScript/TypeScript SDK
│   ├── api.md             ← surface: CRUD, groups, $sort, $match
│   ├── implementation.md  ← ClickHouse SQL behind every SDK call
│   ├── contracts.md       ← service contracts, group contracts, blacklists
│   └── document-typing.md ← leaf-level type convention
├── db/                    ← ClickHouse implementation & setup
│   └── clickhouse.md      ← complete schema: tables, indexes, patterns
├── app-store/             ← the node's public storefront
│   └── overview.md        ← registration (a path is an app), visits, PWA manifests, store UI
├── groups/                ← groups as a platform primitive
│   ├── overview.md        ← policy containers, roles, join policies
│   ├── identity.md        ← profiles, URLs, service-scoped roles
│   ├── requests.md        ← app→user group consent (GCR), auto-approve, bundling
│   └── social-contracts.md ← the exact group contracts the social app creates
├── social/                ← web10-social implementation
│   ├── overview.md        ← how social uses groups: discover, follows, communities
│   ├── cross-app-sharing.md ← mailer pattern, DMs, comments
│   └── group-policy-example.json.md ← concrete role/permission examples
├── media/                 ← the media pipeline: HLS transcoding, streaming, auth
│   ├── transcoding-foundation.md ← the model: source doc, transcoding_settings, variants
│   ├── transcoding.md         ← ffmpeg pipeline, HLS segments, storage, player
│   ├── streaming.md           ← the layers: range requests (day 1) + HLS transcoding
│   ├── minio-auth-bifurcated.md ← presigned URLs everywhere except video (JWT + middleware)
│   ├── streaming-tension.md   ← why streaming is infrastructure, not a type
│   ├── why-minio-not-file-types.md ← why one media type, not video/audio/image
│   └── client-side-transcoding.md ← optional ffmpeg.wasm pre-encode (cost optimization)
└── faq/                   ← common questions, skeptical points
    ├── skeptical-points-addressed.md ← real concerns from the v2→v3 transition
    ├── oltp-to-olap-patterns.md ← how every OLTP operation works with OLAP
    └── olap-only.md       ← why ClickHouse for everything, no Postgres
```

## Quick Links

- **SDK** — `sdk/api.md` (surface), `sdk/implementation.md` (SQL), `sdk/contracts.md` (contracts)
- **Auth & Consent** — `auth/auth.md` (token flow), `auth/consent.md` (consent experience, ideal UX)
- **DB** — `db/clickhouse.md` (tables, indexes, patterns)
- **App Store** — `app-store/overview.md` (registration, visits, PWA manifests)
- **Security** — `security/overview.md` (invariants I1–I5, two-contract model, blocking)
- **Groups** — `groups/overview.md` (primitive), `groups/identity.md` (profiles)
- **Social** — `social/overview.md` (implementation), `social/cross-app-sharing.md` (patterns)
- **Media** — `media/transcoding-foundation.md` (the model), `media/transcoding.md` (the pipeline), `media/streaming.md` (the layers), `media/minio-auth-bifurcated.md` (the auth split)

## What's Not Here (v4)

- **P2P delivery at scale** — WebRTC segment sharing, edge caching, tile-based streaming → `../web10-v4/media/`
- **Federation** — cross-provider groups, ClickHouse `remote()` → `../web10-v4/future/`
- **Real-time** — Redis + WebSocket push → `../web10-v4/future/`
- **Advanced SDK** — `w.query()`, `powerMean` sorting, cross-node addressing, enforced schemas → `../web10-v4/sdk/advanced.md`
- **Finance** — append-only ledgers, compute-on-read balances → `../web10-v4/faq/`
- **Monetization** — ads, Pro features → v4

## Decisions

Decisions land here as they're made:
- Architecture
- Data models
- Protocols
- Security invariants
- Group system
- Service contracts

If it's not here, it's not decided yet.