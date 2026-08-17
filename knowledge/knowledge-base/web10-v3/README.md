# web10 v3 — Core Architecture

This folder holds the finalized, authoritative documentation for web10 v3.

v3 is the core architecture switch: ClickHouse, groups as the primitive, CRUD with groups, auth, social app. Everything here is what we build first.

Everything beyond the core is in `../web10-v4/` — media pipeline, federation, real-time, advanced SDK, finance, monetization.

## Brainstorm

Work-in-progress ideas, alternatives, and explorations live in `web10-v3-brainstorm/`. When a direction is picked and finalized, it moves here.

## Structure

```
web10-v3/
├── README.md              ← you are here
├── encryption/            ← authentication, tokens
│   └── auth.md            ← JWT auth flow, token structure, ACR
├── security/              ← security model, invariants, access control
│   └── overview.md        ← invariants I1–I5, two-contract model, blocking
├── sdk/                   ← the JavaScript/TypeScript SDK
│   ├── api.md             ← surface: CRUD, groups, $sort, $match
│   ├── implementation.md  ← ClickHouse SQL behind every SDK call
│   ├── contracts.md       ← service contracts, group contracts, blacklists
│   └── document-typing.md ← leaf-level type convention
├── db/                    ← ClickHouse implementation & setup
│   └── clickhouse.md      ← complete schema: tables, indexes, patterns
├── groups/                ← groups as a platform primitive
│   ├── overview.md        ← policy containers, roles, join policies
│   └── identity.md        ← profiles, URLs, service-scoped roles
├── social/                ← web10-social implementation
│   ├── overview.md        ← how social uses groups: discover, follows, communities
│   ├── cross-app-sharing.md ← mailer pattern, DMs, comments
│   └── group-policy-example.json.md ← concrete role/permission examples
├── media/                 ← transcoding foundation (schema fields only)
│   └── transcoding-foundation.md ← API fields for transcoded media, HLS gap
└── faq/                   ← common questions, skeptical points
    ├── skeptical-points-addressed.md ← real concerns from the v2→v3 transition
    ├── oltp-to-olap-patterns.md ← how every OLTP operation works with OLAP
    └── olap-only.md       ← why ClickHouse for everything, no Postgres
```

## Quick Links

- **SDK** — `sdk/api.md` (surface), `sdk/implementation.md` (SQL), `sdk/contracts.md` (contracts)
- **DB** — `db/clickhouse.md` (tables, indexes, patterns)
- **Security** — `security/overview.md` (invariants I1–I5, two-contract model, blocking)
- **Groups** — `groups/overview.md` (primitive), `groups/identity.md` (profiles)
- **Social** — `social/overview.md` (implementation), `social/cross-app-sharing.md` (patterns)
- **Media** — `media/transcoding-foundation.md` (schema fields, HLS gap)

## What's Not Here (v4)

- **Media pipeline** — transcoding, streaming, P2P, mobile encoding → `../web10-v4/media/`
- **Transcoding foundation** — schema fields for transcoded media → `media/transcoding-foundation.md` (in this folder)
- **Federation** — cross-provider groups, ClickHouse `remote()` → `../web10-v4/future/`
- **Real-time** — Redis + WebSocket push → `../web10-v4/future/`
- **Advanced SDK** — `w.query()`, `powerMean` sorting, cross-node addressing, enforced schemas → `../web10-v4/sdk/advanced.md`
- **Finance** — append-only ledgers, compute-on-read balances → `../web10-v4/faq/`
- **Monetization** — ads, Pro features, server-side transcoding → v4

## Decisions

Decisions land here as they're made:
- Architecture
- Data models
- Protocols
- Security invariants
- Group system
- Service contracts

If it's not here, it's not decided yet.