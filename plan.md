# web10 v3 Plan

> **THE RULE:** docs first, then code. If the docs are perfect, the LLM
> implements perfect. If the docs are vague, the code is vague. No
> exceptions.

## Hierarchy of Reliance

Every layer depends on the one above it. An LLM implementing any layer
reads only the layer directly above it — never skips, never guesses.

```
Plan (this file)
  ↓
Knowledge base (web10-v3/ — architecture, data model, contracts)
  ↓
Marketing docs (marketing-ui/public/docs/ — customer-facing, derived from KB)
  ↓
Backend / API implementation (ClickHouse, SDK server, CRUD endpoints)
  ↓
Authenticator implementation (ui/ — consent, tokens, service contracts)
  ↓
Social app implementation (marketing/web10-social/ — screens, feeds, groups)
```

If a lower layer contradicts its source above, the source wins. Always.

---

## Phase 0 — Knowledge Base: Mermaid Diagrams

**Where:** `knowledge/knowledge-base/web10-v3/`

The v3 knowledge base has zero Mermaid diagrams. The v2 knowledge base
has five excellent ones (architecture flow, permission decisions,
request flow, sequence diagrams). v3 needs the same visual treatment
so every doc is instantly graspable. Follow `knowledge/AGENTS.md` for
visual styles and voice.

- [✓] **SDK** (`sdk/api.md`) — request flow diagram: client → SDK → API → ClickHouse tables. Show how groups are baked into CRUD (create inserts doc_groups, read joins group_members, update tombstones + re-inserts, delete tombstones).
- [✓] **SDK** (`sdk/api.md`) — group operations sequence: create group, join, invite, accept, leave, remove.
- [✓] **DB** (`db/clickhouse.md`) — data model architecture: all tables, relationships, primary keys, ER-style diagram.
- [✓] **DB** (`db/clickhouse.md`) — data flow: create and read paths, showing the INSERT + JOIN paths for group-filtered reads.
- [✓] **Groups** (`groups/overview.md`) — two-contract-type diagram: service contract (app trust, outer wall) vs group contract (people access, inner permissions). Show the decision chain.
- [✓] **Groups** (`groups/overview.md`) — group architecture: group_contracts → group_members → doc_groups → documents. Who sees what, how roles enforce access.
- [✓] **Social** (`social/overview.md`) — social app architecture: how groups power discover, follows, communities, DMs.
- [✓] **Encryption** (`encryption/auth.md`) — auth flow diagram: login, token minting, certification, SMR handshake.
- [✓] **FAQ** (`faq/oltp-to-olap-patterns.md`) — OLTP-on-OLAP patterns: how CRUD operations map to ClickHouse (ReplacingMergeTree, tombstones, background compaction).
- [✓] **Media** (`media/transcoding-foundation.md`) — transcoding foundation: API schema fields for transcoded media, HLS manifest gap, v4 references.

---

## Phase 1 — Marketing Docs Rewrite (v2 → v3)

**Where:** `marketing/marketing-ui/public/docs/`

The marketing docs currently describe v2 (MongoDB, wapi.js, terms
records, inbox fan-out, separate follows/contacts services). They must
be rewritten to reflect v3 (ClickHouse, createClient SDK, groups as
the core primitive, no inbox, no legacy follows). The knowledge base
is the source of truth — derive every claim from it. Include Mermaid
diagrams where they help the reader.

- [✓ 3.0.9] **Protocol spec** (`protocol-spec.md`) — rewrite: ClickHouse data model, groups-based access (no terms records), v3 token/auth, CRUD with groups, aggregate → ClickHouse SQL.
- [✓ 3.0.9] **SDK guide** (`sdk.md`) — rewrite: `createClient` API, groups baked into CRUD, group operations, media upload, cross-node addressing. Remove legacy wapi.js as primary (keep as compat note).
- [✓ 3.0.9] **Conventions** (`conventions.md`) — rewrite: v3 data model (`documents` table, `ref_value`, `doc_groups`), remove v2 services (inbox, follows, contacts). Groups replace follows/contacts.
- [✓ 3.0.9] **Discovery** (`discovery.md`) — deleted: v3 discovery is group-based reads, not a separate index. No public ledger or schema registry (those are v2). Covered by groups.md + sdk.md.
- [✓ 3.0.9] **Overview** (`overview.md`) — update: ensure v3 concepts (groups, ClickHouse, no algorithm, 100% delivery via group reads) are reflected. The premise and principles are fine; the mechanics need updating.
- [ ] **Design.md-grade** — the docs themselves pass the screenshot test.

---

## Phase 2 — Implement v3 Backend From The Docs

The knowledge base (`knowledge/knowledge-base/web10-v3/`) holds the
finalized architecture. Every implementation task starts by reading
the relevant doc there, then building it. No guessing. No legacy
v2 patterns unless explicitly carried forward.

Lane structure follows the knowledge base:

| Lane | Docs |
|------|------|
| `sdk/` | `sdk/api.md`, `sdk/implementation.md`, `sdk/contracts.md` |
| `db/` | `db/clickhouse.md` |
| `groups/` | `groups/overview.md`, `groups/identity.md` |
| `social/` | `social/overview.md` + `web10-social-v3/` screens |
| `media/` | `media/*.md` |

Each lane reads its doc, implements, ships. Small bites, frequent
merges. The doc is the spec. The code is the proof.

- [✓ 3.0.12] **Bug reports** (`db/clickhouse.md`) — separate ClickHouse table `bug_reports` with base64-encoded screenshots. Public endpoint for submission, admin endpoints for review.
- [✓ 3.0.13] **Bug reports UI** — web10-social and marketing-ui hooked up to `POST /bug_report` with screenshot capture (getDisplayMedia) and paste-to-attach.

---

## Phase 3 — Apps Rebuild (v2 Apps → v3 Contracts + SDK)

Once the v3 backend is live, the existing apps still speak v2's
legacy wapi and contract model. They all need to adapt:

- [✓] **Authenticator** (`ui/`) — consent flow, service contracts, token
  handoff, all rewritten against the v3 SDK and v3 contract model.
  The auth portal is the front door; it must work first.
- [ ] **Social app** (`marketing/web10-social/`) — every screen maps to the
  `web10-social-v3/` docs (11 screens, CRUD + groups + refs).
  No legacy endpoints. No v2 double-writes. Pure v3.
- [✓ 3.0.14] **API v2 cleanup** — 34 v2 endpoints removed (schemas, payments, v2 media, v2 auth, migrations). v3 app store admin endpoints added. Media pipeline complete (upload-url, read-url).
- [✓] **Demo apps** (`docs/hello/`, `docs/notes/`, `docs/messages/`) — the
  runnable demos in the marketing docs must work against v3.
  They are the developer's first impression. If they break, the docs lie.

**Order matters:** authenticator first (nothing works without auth),
then social (the product), then demos (the proof for devs).
