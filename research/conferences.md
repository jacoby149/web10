# Venue Map — web10 Research Paper

Ranked for web10's specific system: user-owned data + IAM-grade group/role
access contracts + creator monetization, deployed and running.

The lead claim is the **access model** (see `README.md`). Venues are grouped
by which part of the system they'd evaluate, then ranked by fit for an
independent author with a real system submitting paper #1.

> **Current target: SIGMOD 2027 industry track.** Deadline: Nov 24, 2026,
> 11:59pm AoE. 12 pages + references. The tier rankings below are the
> historical analysis; the venue decision has moved to the industry track
> (see `README.md` for the change and `knowledge-base/strategy/plan.md` for
> the execution plan).

---

## Tier 1 — Primary targets (realistic for paper #1)

### CIDR — Conference on Innovative Data Systems Research
- **Why it fits:** Smaller review pool than SIGMOD/VLDB. Explicitly loves
  novel data architectures and *industry-built, deployed* systems. "We rebuilt
  the storage layer around user-owned collections and here's why" is exactly
  the CIDR story.
- **Risk:** Small community; if the access model is the lead (not the storage),
  some reviewers may want more of a DB contribution.
- **Format:** Full paper ~12 pages. Also has a workshop track.
- **Verdict:** **Primary target for the full paper.**

### TheWebConf (WWW) — The Web Conference
- **Why it fits:** The web flagship. Decentralized web, social data, and
  platform work all fit. If we lead with the *social/decentralized* angle
  rather than the data architecture, this is the home.
- **Risk:** Broad audience; the access-model depth may read as "systems paper
  at a web conference."
- **Format:** Full paper ~12 pages. Strong workshop ecosystem (good for Step 1).
- **Verdict:** **Primary alternate / Step-1 workshop home.**

---

## Tier 2 — Strong fits (paper #2, or if the angle shifts)

### VLDB (PVLDB)
- Top DB tier, equal to SIGMOD. Friendlier to systems + industry than SIGMOD.
- Good if the storage/query contribution grows into its own story.
- Has workshops (good for Step 1).

### USENIX ATC
- Top-tier systems, more accessible than OSDI/SOSP. Loves deployed systems and
  "here's what we learned running this in production."
- Good fit if the evaluation (real numbers) is the star.

### ACM CSCW (now CSCW / PDCST)
- *The* venue for social computing, groups, collaboration, human factors.
- Best fit if the **group/role social access contracts** are framed as a
  human-computing contribution rather than a security one.
- Smaller, more approachable review than the security venues.

### ICWSM — Intl. AAAI Conf. on Web and Social Media
- Social media mining/behavior. On-topic for the social platform angle.
- More empirical/analytic than systems.

---

## Tier 3 — Reach venues (only after the system + paper mature)

### SIGMOD (ACM)
- The DB flagship. Hardest. Want a deep, novel DB contribution + strong eval.
- **The industry track is the realistic entry point** — it rewards operational
  experience, scale, deployment lessons, and cost, which is exactly what a
  deployed system has. The research track is still not paper #1.
- **Current target: SIGMOD 2027 industry track, deadline Nov 24, 2026.**

### CCS (ACM Computing Security Conference)
- Top security venue. Strong access-control/credentials work.
- Only if we add a real **threat model + attack analysis + formal argument**
  for the authorization model. That's a separate, larger paper.

### USENIX Security
- Top tier. Same bar as CCS for the security angle.

### SOSP / OSDI
- The top systems venues. 2–5% acceptance. Labs with a decade of related work.
- Not for an independent's paper #1. Maybe, much later, if the architecture
  becomes canonical.

### ACM EC (Economics and Computation)
- Top venue for the **monetization/mechanism** angle (creator revenue share,
  token economics, platform pricing).
- The monetization piece is the wildcard that keeps web10 from being "just
  another decentralized social protocol." If it matures into its own
  contribution, EC is where it gets taken seriously. Separate paper.

---

## Small / on-nose venues (workshops + focused conferences)

- **WPES** (Workshop on Privacy in the Electronic Society, co-located with
  CCS) — if the privacy framing leads.
- **IEEE Privacy** — smaller, privacy-focused.
- **CIDR / VLDB / WWW workshops** — the Step-1 targets. Low bar, fast, free
  feedback, right audience.
- **FOSDEM** — open-call, not selective, but good credibility + audience for
  the decentralized-web story. Not a research venue per se.

---

## The recommended path (historical — superseded)

The original path was:

1. **Workshop paper** (3–6 pages) at a **WWW or VLDB workshop** — learn the
   bar, get feedback, put the name out.
2. **Full paper** at **CIDR** (data-architecture lead) or **WWW** (social lead).
3. **Later:** CCS/USENIX Sec (if security model matures), EC (if monetization
   matures), SIGMOD/SOSP (if the architecture becomes canonical).

**Superseded:** the target is now the **SIGMOD 2027 industry track** (a single
submission, not a two-step workshop→full-paper ladder). The workshop paper
(`workshop/main.tex`) was written under the old plan and serves as the draft
foundation for the full paper.

---

## Deadlines

Venue cycles move; confirm before committing.

| Venue | Typical cycle | Deadline | Notes |
|---|---|---|---|
| **SIGMOD 2027 industry track** | 1/yr | **Nov 24, 2026, 11:59pm AoE** | **Current target.** CMT not yet open. 12 pages + refs. |
| WWW workshop | ~2 cycles/yr | TBD | Confirm co-located workshop + date |
| CIDR | 1/yr | TBD | Usually ~Oct/Nov for following spring |
| VLDB | 2/yr (PVLDB vols) | TBD | Rolling volumes |
| USENIX ATC | 1/yr | TBD | Usually ~Feb |
| CSCW | 1/yr | TBD | Usually ~Aug |
| CCS | 1/yr | TBD | Usually ~Jan/Feb |
| EC | 1/yr | TBD | Usually ~Oct |

**Action:** the SIGMOD 2027 industry track deadline is pinned (Nov 24, 2026).
The evaluation data collection (see `evaluation-plan.md`) is on the critical
path — if we don't have production numbers yet, that collection starts *now*,
not at draft time.
