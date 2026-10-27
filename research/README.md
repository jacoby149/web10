# web10 — Research Paper Strategy

**Author:** Jacob Hoffman (web10 Inc.)
**System:** web10 — user-owned data platform with fine-grained group/role access contracts + creator monetization
**Status:** planning
**Last updated:** 2026-10-27

---

## The one-paragraph strategy

web10 is a data platform where **each user owns their data** (their own storage
collection), **access is governed by fine-grained, revocable, group/role-scoped
contracts** (cloud IAM pushed to the front of a social data platform), and
**creators monetize** their audience through the platform's payment rails. The
system spans four communities — databases/storage, security/access-control,
social computing, and economics/monetization.

A single paper cannot claim all four as contributions. The strategy is:

> **One claim, one venue, one paper.** The other contributions become the
> motivating application and future work, not the thesis.

**The claim (the paper's spine):**

> We present web10, a data architecture in which each user owns their data and
> access is governed by fine-grained, revocable, group/role-scoped contracts —
> bringing cloud-grade identity-and-access-management (IAM) primitives to the
> front of a social data platform.

Everything else (the ClickHouse-per-collection storage, the social app, the
monetization rails) hangs off that sentence as context, implementation, or
motivation.

---

## Why this claim and not the others

| Candidate claim | Why it's NOT the lead | Where it goes instead |
|---|---|---|
| User-owned storage (ClickHouse per collection) | An implementation detail; the novelty is in *how* it's accessed, not that it exists | System section |
| Group/role access contracts (IAM to the front) | **The novel, defensible, citable core** — a reviewer can evaluate it | **The claim** |
| Creator monetization / revenue share | An application layer; needs an economics venue to be the lead | Motivating app + future work (or a separate EC paper later) |
| The social app (web10-social) | A demo, not a contribution | Evaluation / case study |

The access model is the part that is (a) genuinely new in this combination,
(b) evaluable by a DB/security reviewer, and (c) the thing that makes the
other three coherent.

---

## The unfair advantage (this is what wins)

Most independent submissions die on one question: *"Is this real, or a toy?"*

web10 is **deployed and running**. We have real users, real collections, real
documents, real access decisions, real latency, real cost. That is the single
biggest asset this paper has. A lab with a simulation cannot produce what we
can: **production numbers.**

The evaluation section is not a nice-to-have. It is the load-bearing wall. See
`evaluation-plan.md`.

---

## The gap (what nobody else has done)

Working hypothesis — to be confirmed in `related-work.md`:

> No prior system combines **user-owned storage** + **IAM-grade group/role
> access contracts** + **creator monetization** in one coherent, deployed
> system.

- Decentralized social protocols (Solid/ActivityPods/ATProto) have user-owned
  data but weak or absent fine-grained *group/role authorization* and no
  first-class monetization.
- Cloud IAM (AWS IAM, etc.) has the authorization model but is
  infrastructure-trust, not user-owned, and not social.
- Conventional social platforms (Meta, TikTok) have monetization and social
  graphs but the user owns nothing and access is platform-controlled.

web10 sits in the empty intersection. **That intersection is the paper.**

---

## The venue ladder

Do NOT aim at SOSP/OSDI/CCS for paper #1. That is a 2–5% acceptance fight
against labs with a decade of related work. The realistic ladder for an
independent author with a real system:

### Step 1 — Workshop paper (3–6 pages) FIRST
- Co-located with **TheWebConf (WWW)** or **VLDB**.
- Low bar, fast turnaround, gets the system + the name in front of the exact
  right audience.
- Reviewer feedback is free R&D on the full paper.
- This is the smart independent move: learn the bar without burning a year.

### Step 2 — Full paper (12 pages)
- **CIDR** (Conference on Innovative Data Systems Research) — *primary target.*
  Smaller review pool, loves novel data architectures, industry-built/deployed
  systems do well there.
- **TheWebConf (WWW)** — alternate, if we lead with the social/decentralized
  angle instead of the data architecture.

### Step 3 — Later, only if the access model matures
- If we add a real threat model + attack analysis + formal security argument:
  **CCS** or **USENIX Security**.
- If the monetization becomes its own contribution: **ACM EC** (Economics and
  Computation).

Full venue map with rationale: `conferences.md`.

---

## Affiliation & transparency

- Submit under **web10 Inc.** as the affiliation. Signals a real, funded,
  deployed project — not a toy. The IP is the company's; the author is Jacob.
- **Be transparent.** Founders publish about their own systems constantly.
  List Jacob Hoffman as author, web10 Inc. as affiliation, and disclose any
  conflict of interest if the venue asks. Do **not** hide that the author built
  the system — that is the only thing that actually gets people in trouble.
- Get an **ORCID** for the author (free, persistent author ID). Some venues
  require it.
- web10 Inc. needs a minimal institutional presence: a real domain, the
  affiliation string, that's enough.

---

## The work plan (what lives in this folder)

In order:

1. **`brief.md`** — the one-page pin: the claim, the demoted contributions,
   the target venue, the "why now / why it matters" paragraph. *The paper's
   skeleton.*
2. **`related-work.md`** — the 8–12 closest prior systems, each with what they
   did, what they're missing, and the citation. This is where the gap gets
   confirmed.
3. **`evaluation-plan.md`** — the exact metrics to pull from the running
   system. The load-bearing wall.
4. **`conferences.md`** — the full venue map with rationale and deadlines.
5. **`draft/`** — the actual paper. Abstract → Intro → System → Access Model →
   Evaluation → Related Work → Conclusion. Markdown-first, convert to the
   venue's LaTeX template at submission time.

---

## Open questions (answer before drafting)

- [ ] What is the system's name in the paper? "web10" or a codename?
- [ ] What scale can we honestly report? (users, collections, documents,
      access decisions/day)
- [ ] Is there a baseline we can compare against? (same social app on a
      conventional shared-DB backend)
- [ ] Do we have production latency/cost numbers, or do we need to instrument
      and collect them first? (If the latter, that's a multi-week task *before*
      the paper.)
- [ ] Workshop target: WWW or VLDB, and which year's cycle?
- [ ] Does web10 Inc. have an ORCID / institutional email for submissions?
