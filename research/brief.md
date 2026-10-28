# One-Page Brief — web10 Paper

*The paper's skeleton. Everything in `draft/` hangs off this page. If this
page is wrong, the paper is wrong. Sharpen the claim before writing anything
else.*

---

## The claim (one sentence)

> We present **web10**, a data architecture in which each user owns their data
> and access is governed by fine-grained, revocable, group/role-scoped
> contracts — bringing cloud-grade identity-and-access-management (IAM)
> primitives to the front of a social data platform.

*Draft. We will sharpen this. The test: can a reviewer who has never seen
web10 read this one sentence and know exactly what is new?*

---

## The contributions (ranked)

1. **[THE CLAIM]** A user-owned data architecture where authorization is
   first-class: fine-grained, revocable, group/role-scoped contracts govern
   access to each user's own data. (IAM to the front.)
2. *(context)* A storage model in which each user's data lives in their own
   collection, accessed through a scoped, expiring token over a tiny CRUD API.
3. *(motivating app)* A social platform (web10-social) built entirely on these
   primitives — proof the model supports a real, demanding application.
4. *(future work / separate paper)* Creator monetization through the
   platform's payment rails.

Only #1 is the contribution. #2 is the system. #3 is the evaluation/case
study. #4 is future work (or its own EC paper later).

---

## The gap (why this is new)

No prior system combines **user-owned storage** + **IAM-grade group/role
access contracts** + **creator monetization** in one coherent, deployed system.

- Decentralized social (Solid, ActivityPods, ATProto): user-owned data, but
  weak/absent fine-grained group/role authz, no first-class monetization.
- Cloud IAM (AWS IAM, etc.): the authz model, but infrastructure-trust, not
  user-owned, not social.
- Conventional social (Meta, TikTok): monetization + social graph, but the
  user owns nothing; access is platform-controlled.

web10 is the empty intersection. **Confirm against `related-work.md` before
drafting — the gap must survive contact with the actual literature.**

---

## Why now / why it matters (the intro's hook)

The current web concentrates user data in platform-controlled silos with
coarse, platform-defined access. Users can't leave with their data, can't
govern who sees what at fine granularity, and can't monetize their own
audience. Cloud IAM solved fine-grained authorization for infrastructure but
never exposed it to end users. web10 brings that model to the user: own your
data, contract its access, monetize your audience. *This is the "so what" —
make it land in two sentences.*

---

## Target venue

- **SIGMOD 2027 industry track** — 12 pages + references. Deadline:
  **Nov 24, 2026, 11:59pm AoE**. Internal freeze: **Nov 20**.
- The original plan (workshop first, then CIDR) is superseded. See
  `README.md` for the venue change and `conferences.md` for the historical
  venue map.

---

## The evaluation promise (the load-bearing wall)

We will report **production numbers** from the running system:
- Scale: users, collections, documents, access decisions/day.
- Access-control decision latency (p50/p99).
- Cost of the per-user-collection model vs. a shared-table baseline.
- The same social app's behavior on web10 vs. a conventional backend.

Full metric list: `evaluation-plan.md`. **If we don't have these numbers yet,
collecting them is the first task, not the last.**

---

## What "done" looks like for this brief

- [ ] Claim is one sentence a stranger can repeat.
- [ ] Gap confirmed against `related-work.md` (not just hypothesized).
- [x] Venue + deadline pinned (Step 1 and Step 2). — **SIGMOD 2027 industry
      track, Nov 24, 2026.** (The original two-step workshop→CIDR plan is
      superseded; the venue is now a single target.)
- [ ] Evaluation data: confirmed we have it, or a dated plan to collect it.
- [ ] System name for the paper decided (web10 vs. codename).
