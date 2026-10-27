# Related Work — web10

*The purpose of this file is to confirm the gap. For each prior system: what
it did, what it's missing that web10 has, and the citation. The gap survives
only if, after reading all of these, the combination is still empty.*

**The gap hypothesis (from `brief.md`):**
> No prior system combines user-owned storage + IAM-grade group/role access
> contracts + creator monetization in one coherent, deployed system.

Each entry below should be checked against that hypothesis. Mark each with:
- `[CONFIRMED GAP]` — they lack the combination, gap holds.
- `[THREAT]` — they're closer than expected; the claim needs sharpening.
- `[CITE-ONLY]` — background, not a direct competitor.

---

## A. Decentralized / user-owned social data

### Solid (Tim Berners-Lee, MIT / Inrupt / W3C)
- **What it did:** User-owned "Pods" (personal data stores), apps access via
  scoped tokens, W3C standardization effort. The closest philosophical cousin.
- **What it's missing (hypothesis):** Fine-grained *group/role* authorization
  is weak/absent relative to cloud IAM; no first-class creator monetization.
  Also: thin top-tier academic publication record (mostly symposia/workshops,
  not SIGMOD/CCS-tier) — itself a signal of the gap.
- **Citation:** TODO — find the Solid protocol paper(s) + W3C spec. The
  academic footprint is small (Solid Symposium 2023/2024/2025, MyData 2023,
  FOSDEM). Locate any arXiv/DOI protocol paper.
- **Status:** `[ ]`

### ActivityPub / ActivityPods
- **What it did:** Federated social activity protocol (Mastodon's protocol);
  ActivityPods combines it with Solid-style pods.
- **What it's missing (hypothesis):** Authorization is federation-trust, not
  fine-grained user-contracted group/role IAM; monetization not first-class.
- **Citation:** TODO
- **Status:** `[ ]`

### ATProto (Bluesky)
- **What it did:** Decentralized social protocol, user-owned data on
  Datastore servers, scoped access.
- **What it's missing (hypothesis):** Group/role access contracts are not the
  core abstraction; monetization is platform-level, not user-contracted.
- **Citation:** TODO
- **Status:** `[ ]`

---

## B. Cloud IAM / fine-grained access control (the model we're bringing to the front)

### AWS IAM / resource-based policies
- **What it did:** The reference fine-grained, role/policy-based, revocable
  authorization model for infrastructure.
- **What it's missing (hypothesis):** It is infrastructure-trust — the cloud
  provider owns the data plane; end users don't own their data; not social.
  web10's move is to make *this* model the user-facing social primitive.
- **Citation:** TODO (AWS IAM docs / any academic treatment of IAM policies)
- **Status:** `[CITE-ONLY]` (it's the model, not a competitor)

### RBAC / ABAC literature
- **What it did:** Decades of role-based and attribute-based access control
  theory (Sandhu's RBAC, etc.).
- **What it's missing (hypothesis):** None of it is user-owned-data + social +
  monetized. This is the theoretical backbone to cite, not a competitor.
- **Citation:** TODO (Sandhu RBAC 1992/1996, ABAC surveys)
- **Status:** `[CITE-ONLY]`

---

## C. Conventional social platforms (the status quo we're replacing)

### Meta / TikTok data + monetization model
- **What it did:** Platform-owned data, platform-controlled access,
  platform-captured monetization, coarse user-facing privacy settings.
- **What it's missing (hypothesis):** The user owns nothing; access is
  platform-defined, not user-contracted; monetization is captured, not
  creator-owned.
- **Citation:** TODO (likely framing/citation, not a system paper)
- **Status:** `[CITE-ONLY]`

---

## D. Databases / storage architectures (the system's substrate)

### Per-tenant / multi-tenant storage isolation
- **What it did:** The literature on tenant isolation in multi-tenant DBs
  (row-level security, schema-per-tenant, DB-per-tenant).
- **What it's missing (hypothesis):** web10's "collection per user" is
  DB/collection-per-user taken to the end-user as tenant — cite the multi-tenant
  isolation work as the closest DB ancestor, note the difference (the tenant
  is the *end user*, not a B2B customer).
- **Citation:** TODO
- **Status:** `[ ]`

### ClickHouse / analytical storage for social workloads
- **What it did:** Columnar OLAP storage; web10 uses a single ClickHouse
  `documents` table keyed by `(author_key, doc_id)`.
- **What it's missing (hypothesis):** Not a competitor — it's the substrate.
  Cite for the storage choice; the contribution is the access model on top.
- **Citation:** TODO (ClickHouse paper if one exists)
- **Status:** `[CITE-ONLY]`

---

## E. Monetization / creator economics (future-work / separate paper)

### Platform revenue-share / creator economy literature
- **What it did:** Work on creator monetization, revenue sharing, platform
  economics.
- **What it's missing (hypothesis):** Not combined with user-owned data +
  user-contracted access. This is the wildcard that differentiates web10;
  likely its own EC paper later.
- **Citation:** TODO
- **Status:** `[ ]`

---

## The gap check (fill after all entries are cited)

After every entry above is filled and cited, answer:

1. Is there ANY single system that has all three (user-owned + IAM-grade
   group/role contracts + creator monetization)? If yes → `[THREAT]`, sharpen
   the claim to the specific combination that's still empty.
2. What is the *closest* system, and what is the *one specific thing* web10
   has that it doesn't? That one thing is the paper's actual novelty sentence.
3. Does the gap survive? `[YES]` / `[NO — reframe]`

**Do not start `draft/` until this check is `[YES]`.**
