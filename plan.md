# web10 v3 Plan

> **THE RULE:** docs first, then code. If the docs are perfect, the LLM
> implements perfect. If the docs are vague, the code is vague. No
> exceptions. The marketing page docs are the source of truth for
> what the product is. The knowledge base is the internal brain. The
> marketing docs are the face.

---

## Phase 0 — Customer-Facing Docs

**Where:** `marketing/marketing-ui/public/docs/`

The marketing site is the first thing anyone sees. The docs there
must read as a finished product, not a technical spec. Iterate until
they are kickass.

- [ ] Docs audit: what exists now vs what a visitor needs
- [ ] Protocol overview: what is web10, in plain language
- [ ] SDK docs: how to build on web10
- [ ] Developer quickstart: from zero to first app
- [ ] Conventions & schemas: the data model, readable
- [ ] Discovery & groups: how discovery works without an algorithm
- [ ] Design.md-grade: the docs themselves pass the screenshot test

When the docs read as a product you would ship tomorrow, we implement.

---

## Phase 1 — Implement v3 From The Docs

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

---

## Phase 2 — Apps Rebuild (v2 Apps → v3 Contracts + SDK)

Once the v3 backend is live, the existing apps still speak v2's
legacy wapi and contract model. They all need to adapt:

- [ ] **Authenticator** (`ui/`) — consent flow, service contracts, token
  handoff, all rewritten against the v3 SDK and v3 contract model.
  The auth portal is the front door; it must work first.
- [ ] **Social app** (`marketing/web10-social/`) — every screen maps to the
  `web10-social-v3/` docs (11 screens, CRUD + groups + refs).
  No legacy endpoints. No v2 double-writes. Pure v3.
- [ ] **Demo apps** (`docs/hello/`, `docs/notes/`, `docs/messages/`) — the
  runnable demos in the marketing docs must work against v3.
  They are the developer's first impression. If they break, the docs lie.

**Order matters:** authenticator first (nothing works without auth),
then social (the product), then demos (the proof for devs).
