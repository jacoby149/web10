# Thinking Note — the Digital Ocean Experiment

**Status: thinking, not a plan.** This is the pre-mortem for the droplet
evaluation before any money is spent. It is deliberately separate from
`evaluation-plan.md` (what to measure) and `experiments/README.md`
(known harness defects): this file is about *what the experiment actually
is, what it can and cannot claim, and what the paper should say about it
either way.*

## What we actually have

Two independent harnesses share the DO story but must not be conflated:

| Harness | What it is | Status |
|---|---|---|
| Legacy query harness (`spinup.sh`/`teardown.sh`/`seed.py`/`bench.py`/`run.sh`) | Synthetic load: compose-up → seed N users → hammer `/v3/query` → scrape phase timings | **BLOCKED** — eight validity gates open in `experiments/README.md` (syntax error, fake password hash, wrong token transport, no Origin/app-contract path, no prepare/media/private mix, broken reader scheduling, unfilterable logs, no repeated trials) |
| Connected social runner (`social/run.sh`) | Real browser journey on a fresh droplet: signup, popup auth, compose, follow, engage, 20-post feed reloads, interop joins, evidence collection | **Implemented, not yet executed on a droplet** — local Docker daemon unavailable in the implementation workspace; 13 Node + 24 Python offline tests pass |
| Pre-experiment baby test (`pre-experiment/`) | Spin up s-1vcpu-1gb nyc1 → docker hello-world → error container → verify survival → destroy | De-risks the DO lifecycle only. Passing it proves nothing about the benchmarks. |

The DO layer itself is thin and sound: `DO_API_TOKEN`, tag-scoped
provisioning (`web10-sigmod` / `web10-sigmod-pre`), `trap cleanup EXIT`
destroy-on-every-exit, stale-droplet sweep, kill -9 recovery by tag. The
Hetzner → DO migration (3.251.0) is a cost/region choice, not a
methodology change.

## The three claims the paper could make, and which survive

1. **"web10 runs a real social app on one generic node."** Survives today.
   E4b + the live pilot (28.10) already carry it. No droplet needed.
2. **"The authorization layer costs X."** Requires the connected runner's
   phase timings (E2) with warmups separated, repeated trials, and the
   causal ablation. The legacy `bench.py` `overhead_pct` is a phase ratio
   of medians and must never be cited as overhead.
3. **"It scales to N users at $/month."** Requires the legacy harness
   fixed, or a scale sweep added to the connected runner. **Nothing
   establishes a 100K-user or 2GB result today.**

The industry track rewards (1) + operational honesty about (2) and (3).
It does not require (3) to be a big number.

## What the droplet is and is not

- It is a **disposable, co-located localhost experiment**: browser and
  services on the same box, only proxy `127.0.0.1:80` + MinIO `:9000`
  published. It measures the node under a real application workload.
- It is **not** a WAN/browser-experience benchmark (no remote client).
- It is **not** a capacity/scaling experiment (the runner explicitly
  excludes it; no p99, no max-capacity claim).
- It is **not** the E3 baseline (PostgreSQL RLS shared-table comparison —
  unbuilt).
- It is **not** production. The live Ubuntu server (597 accounts, 593
  documents, 49 groups) is a separate, dated observation. The paper must
  keep these two populations labeled apart.

## The honest cost story

DO s-4vcpu-16gb nyc3 ≈ $0.30/hr, hourly billing, destroyed on exit.
The baby test costs under $0.05. The real run's cost is dominated by
wall time (builds, 20+20 repetitions with 61s rate-limit quiet windows),
not by the instance. **Record the actual purchased instance, region,
dates, billed rate and invoice** — the E6 gate. A "cheap VPS" label is
not a measurement; the paper's cost section (E3) needs the invoice, not
the price page.

## The decision points (answer before spending money)

1. **Which harness runs first?** Recommendation: the connected social
   runner, because it is already implemented and its evidence (real
   auth, real feed path, interop joins) is what E2/E4/E4b actually need.
   The legacy harness stays blocked until its eight gates clear — do not
   "just run it" and discover the numbers are invalid after the fact.
2. **One droplet or two?** The runner and the legacy bench are mutually
   exclusive on one box (different compose projects, different seeds).
   Run them sequentially on one droplet, or parallel on two. Sequential
   is cheaper; parallel is faster. Decide by deadline pressure (freeze
   Nov 20).
3. **Repetitions.** Default 20 per distribution with 2 warmups. p95 is
   emitted only at n ≥ 20 and labeled same-session. If we want p99, we
   need more repetitions and a stated reason — otherwise skip it and say
   so (the runner already refuses to invent it).
4. **What do we do with a failed run?** A run that fails or collects too
   few samples exits nonzero. **A failed run is still paper material**:
   the manifest + interrupted journal record what broke. The industry
   track values the failure account. Do not silently re-run until green.
5. **Evidence custody.** Artifacts land in `.context/evaluation/<runid>/`
   on the droplet. Copy them off **before** destroying the host; verify
   the droplet is actually deleted (billing check), not just "teardown
   printed success."

## What the paper section should say (draft posture)

- Name the experiment exactly: "a disposable Digital Ocean droplet
  (s-4vcpu-16gb, nyc3, Ubuntu 24.04), co-located browser and services,
  fresh storage per run, destroyed after collection."
- State the placement honestly: localhost, no WAN latency, browser shares
  resources with services.
- Report: phase timings (all ten phases, not just readable/execute),
  empty vs nonempty feed distributions, error counts, active-reader
  counts, warmup separation, repetition count, and the interop join
  results (denial → grant → revoke cycles).
- Keep the legacy-harness status visible in the paper's limitations:
  "a synthetic scale harness exists but was not used for the reported
  numbers because its validity gates were open at submission time."
  That sentence is a strength, not a weakness, for an industry track.
- Never: cite `overhead_pct` as overhead, cite synthetic users as active
  users, or merge droplet numbers with live-server numbers.

## Open questions

- Is the E2E CI blocker (`group_contracts.tags` schema race, plan.md)
  fixed on dev? A fresh droplet boots a fresh ClickHouse — the race may
  bite the runner's `POST /setup/configure` exactly like it bit the e2e
  shards. **Check before provisioning.**
- Does the runner's one-hour Playwright limit hold at 20+20 repetitions
  with the 45-query/61s pacing? Estimate wall time before the run; if it
  doesn't fit, reduce repetitions and say so.
- Who holds the `DO_API_TOKEN` and where does it live (env on the
  operator's machine only — never in the repo)?
- Do we want a second region or instance size as a variance point? Cheap
  to add (one more baby-test-sized run), and it turns "one box" into
  "we checked it wasn't the box." Optional; deadline-dependent.

## The access-control cost function (the real experiment)

**Reframe (supersedes the lakehouse-ladder sweep above).** Benchmarking
"how fast is the data lakehouse" is goofy — a reviewer reads "we seeded 1M
rows and the query was X ms" as a ClickHouse datasheet with extra steps.
The interesting, ownable system is **the layer we put on top of a fast
engine that everyone else solves by adding more infrastructure**: user-managed
access control enforced *inside the query*, on a *shared* table, with
*logical* (not physical) per-user namespaces. The lakehouse is the
*enabler*, not the *result*. So the experiment measures **the cost of the
access-control layer we built** — the Python logic + the Python-issued
ClickHouse *metadata* queries — and holds the columnar *scan* constant.

**What "our part" is (the exact boundary the plot depends on).** The Y-axis
is the sum of the phases that are Python + Python-issued CH metadata, i.e.
everything the node does *before* it hands a scoped query to the engine:

| Phase | What it is | Ours? |
|---|---|---|
| `auth` | JWT verify (`auth.py`) | YES — pure Python |
| `app_contract` | origin/contract check (Python + CH metadata) | YES |
| `candidates` | resolve which groups the reader can see (`get_user_groups`) | YES |
| `readable` | **resolve the readable set of K contracts** — membership rows, `anyone`/`authenticated` grants, per-service role maps | YES — the crown jewel, scales with K |
| `group_meta` | pull the contracts' role/permission metadata | YES |
| `compile` | **AST parse + CTE policy injection** (`safe_query.py`) — the "AST logic securing things" | YES — pure Python |
| `execute` | the actual columnar scan | **NO — stubbed to a fixed constant** |
| `serialize`/`prepare` | shape the response (Python + CH media minting) | YES |

Everything above the `execute` stub is web10; we measure web10. The scan is
held flat and reported separately (one real measurement per scale gives the
constant the stub stands in for — and shows the policy cost is modest
*relative to* the real scan, the "the lakehouse is the enabler, not the cost"
line).

**The scale axis is K, not user count.** The pipeline's cost scales with
**K = the number of group contracts in the reader's readable set for this
query**, not with "users in the database." A node can hold 1M users and be
fast if each reader touches 3 groups; it can choke at 10k if one reader's
feed fans out across 500 contracts. User count is just the knob that gets you
to a K. **The contract mix is the realism**: a real reader's readable set is
mixed — contracts they *own* (owner short-circuit, cheapest), contracts they're
a *member* of (followed creators' followers groups, mid), and contracts read
via the **`anyone`/`authenticated` principal grant** (public discover, no
membership row — the D58 path that bit the `/trending` bug). Seed the mix.

**Two feeds, opposite K behavior — this is the plot.** Confirmed in
`marketing/web10-social/src/data/feed.ts`:
- **Discover feed** (`readDiscoverFeed`, :26) reads from **ONE group** — the
  node's single discover board — with a `limit` (default 50). **K = 1,
  constant**, regardless of node size. The board is a single shared group, not
  "all creator contracts."
- **Personal feed** (`readFeed`, :343) reads from `getFeedGroups()` = every
  group the reader belongs to minus discover. **K = the reader's following
  count** — one followers-group contract per creator followed. This is the one
  that grows.

So the figure is **two lines on one chart** (X = K, Y = policy-pipeline cost,
`execute` stubbed):
1. **Personal feed: cost vs. K** (K = 10 → 100 → 1,000 followed creators,
   mixed owned/member/principal). The curve that *moves* — where "following
   more people" starts to cost. The thesis: *the access-control cost scales
   with your social graph, not with the node's size.*
2. **Discover feed: a flat line at K = 1** across 10k/100k/1M *node* users.
   The other half of the thesis: *the public feed does NOT degrade as the node
   grows* — because it's one board group + a limit, not a fan-out. **Label the
   flatness as a design choice** (single board group + `limit`), not a free
   property: a future discover design that fanned out over per-creator
   contracts would turn the flat line into a curve.

**The one-sentence claim the plot supports:** *"web10's access-control layer —
JWT auth, contract checks, readable-set resolution over K group contracts, and
AST-level query scoping — adds a measured cost in K (the reader's social
graph), independent of node size; the public discover feed resolves a single
board contract and stays flat as the node scales; the columnar scan is held
constant and is not the subject of the measurement."*

**Why this is also the easiest version.** No instance ladder (one box — you're
not scanning 90M rows). No content seed (metadata only: each creator = a
followers-group contract + an `anyone` grant + a few posts; the reader follows
K of them — K is the knob, you don't need 1M *active* users). No storage math,
no merge-activity variance, no "bad day on the VM" noise (stubbed scan is
near-deterministic → reproducible, which is what de-risks a solo author who
can't re-run a 4-box 1M experiment five times). Runs that fit in an afternoon
on one droplet.

**Honest caveats (so the plot doesn't overclaim).**
- The personal-feed curve measures **K up to whatever you seed** — showing
  K=1,000 is fine claims "fine to 1,000 followed creators," not "to infinity."
  Report the cost function (ms/contract) + the knee if there is one; a
  linear-in-K curve with a known constant is a *good* result ("following 2×
  more people costs 2× more policy resolution at X ms/contract — predictable"),
  not a failure.
- "Scales" here means **"has a measured, predictable cost function in K,"** not
  "stays flat to 1M." The wins that *are* flat: discover (K=1 by design) and
  the scan (stubbed). The thing that *grows*, honestly labeled: the personal
  feed, with your following.
- **This is the primary experiment.** The 4-node cross-node fan-out (the direct
  Solid comparison — they scale 2→128 pods; you'd scale 1→4 nodes with the same
  question) is a **named follow-up** that reuses this harness once the
  multi-node read path (the `multi-node.md` phases A–E, `api2.localhost`)
  exists. Don't let the cool 4-node idea block the cheap number that's the
  paper's spine.

**Gates before the first dollar (in order).**
1. The `readable` path must use the **batched** variant for the feed read —
   see "Does the current code scale?" below; the per-group variant is the
   thing that won't scale and the experiment would measure the wrong thing.
2. Stub `execute` (return a fixed-size synthetic result set; skip the real
   columnar scan) — a test-mode flag, not a production change.
3. Metadata-only seed: N creators (contract + `anyone` grant + a few posts),
   one reader following K of them, K ∈ {10, 100, 1,000}; discover board with
   the node's public creators attached.
4. One real `execute` measurement per scale to report the stubbed constant.
5. Verify the `group_contracts.tags` fresh-boot race is fixed on dev; confirm
   `DO_API_TOKEN` custody.

**Cost ceiling.** One small box (s-4vcpu-16gb, ~$0.30/hr), metadata-only seeds
(minutes, not the 30–60 min of a 90M-doc content seed), an afternoon of runs
across K × {personal, discover} × 3 trials. **Well under $5 total.** The
expensive lakehouse ladder is gone.

**What we are NOT measuring, and why (the paper's scope statement).** The
evaluation deliberately excludes two large cost centers, and the paper must say
so *where the claim is made*, not bury it in limitations — a reviewer who sees
"we didn't benchmark the database or the CDN" without an explanation reads a
gap; with the explanation reads **scope discipline**. The contribution is the
security layer we *added*; the things we don't measure are the things that are
already solved, well-understood, and not ours:

1. **The ClickHouse columnar scan (`execute`) — not measured, held constant.**
   ClickHouse is a battle-tested OLAP engine; benchmarking *it* is a datasheet,
   not a result about web10. We stub `execute` to a fixed constant (measured
   once per scale and reported) so the figure isolates the layer we built. The
   claim is *not* "the database is fast" — it's "the access-control layer adds
   a measured, predictable cost *on top of* a fast engine." The engine is the
   enabler, named and credited, not the subject.
2. **Media delivery (the CDN) — not measured, offloaded by design.** Per the
   Cloudflare plan (`cloudflare-plan.md`), images/audio/docs are presigned
   key-URLs served straight from the origin/CDN (the node mints once, never in
   the byte path), and video segments are edge-verifiable JWTs (Part B) with the
   node out of the byte path. Media cost scales with *views/bandwidth* and is
   absorbed by the CDN + R2 (egress ~$0) — it does not load the node the way
   feed queries do. Measuring it would be benchmarking Cloudflare/R2, not
   web10. The paper states: *media delivery is CDN-offloaded by construction;
   the node's per-view cost is O(capability mints + manifest re-checks), not
   O(segments); therefore view count is out of scope for the node evaluation.*

**The one-sentence scope line for the paper:** *"We evaluate the access-control
layer web10 adds — JWT auth, contract checks, readable-set resolution over K
group contracts, and AST-level query scoping — holding the columnar scan
constant (a solved, credited dependency) and excluding CDN media delivery
(offloaded by design, a solved dependency); the contribution is the cost and
behavior of the layer we built, not the performance of the engines it stands
on."*

This is also the anti-embarrassment move: it pre-empts "why didn't you measure
X?" by answering it up front, and it keeps the claim exactly as large as the
evidence — no bigger (no "the whole system is fast") and no smaller (no hiding
that we scoped things out).

### Does the current code scale? (read before trusting the plot)

Reading `api/app/v3/services/clickhouse.py` + `safe_query.py`:

- **`readable_groups` (:1542) is the risk.** It is
  `[g for g in candidate_group_ids if can_read_group(g, …)]` — a **Python
  loop, one effective-role check per candidate group**, and the docstring says
  it plainly: *"one effective-role check per candidate group (a few small
  metadata queries each). Correct first; a batched variant is the fast-follow
  for high-fanout feed reads."* Each `can_read_group` (:1512) does
  `is_group_member` (a CH query) **and**, for non-members,
  `effective_role_perms` (more CH queries). So the personal feed's `readable`
  phase is **O(K) round-trips to ClickHouse from Python** — at K=1,000 that's
  ~1,000+ small queries per feed load. **This is the thing that will NOT
  scale, and it's the thing the experiment exists to expose.**
- **A fix already exists and is not wired into the feed path.**
  `readable_groups_batched` (:1553) resolves the *whole* candidate set in
  **three batched queries** (memberships + public-class rows + role
  definitions) instead of a handful per group — identical semantics,
  order-preserving. The feed path (`query.py:224`) calls the **per-group**
  `readable_groups`, not the batched one. So the codebase *knows* the per-group
  version is the slow path and has the batched replacement — it just isn't
  used where it matters.
- **`compile` (the CTE injection) is O(K) in *string size*, not round-trips.**
  `safe_query.py` builds the boundary CTE with `WHERE dg.group_id IN
  ('g1','g2',…,'gK')` (`_quote_group_ids`, :127) and the group_meta CTE with
  `WHERE group_id IN (…candidates…)` (:307,:313). That's a single query whose
  `IN` list grows with K — fine to a few thousand, but the SQL text (and
  ClickHouse's parse of a giant `IN`) grows linearly, and there's no chunking.
  Secondary to the `readable` round-trip problem, but it's the second line on
  the plot.

**So the honest answer to "does it look like it scales?":** the *design*
scales (the batched variant proves the O(1)-round-trip version is expressible),
but the *current feed path* uses the O(K)-round-trip `readable_groups`, so as
written it will bend early — probably in the low hundreds of K. **That's not a
reason not to run the experiment; it's the experiment's most valuable
possible finding.** The plot either (a) shows the per-group path bending at
some K and the batched path staying flat — a clean "we found the bottleneck,
here's the one-line fix, here's the before/after" result, or (b) shows both
flat to K=1,000 — an even better "it just works" result. Either way the figure
is publishable and the code is honest. **Recommendation: run the experiment on
*both* the current per-group path and the batched path (a flag), so the plot
shows the fix, not just the problem.** That turns a potential "it doesn't
scale" embarrassment into a "here's the bottleneck and the fix" contribution.

## Will reviewers embarrass us? (the sufficiency pre-mortem)

The scale sweep is *necessary, not sufficient*. Three specific ways this
evaluation gets torn apart at SIGMOD, and the mitigation for each:

**1. "Synthetic users are not users."** The entire sweep is generated
data with uniform post counts and a named fan-out. A reviewer will say
the workload is invented. *Mitigation:* label it synthetic in the
abstract, not just the limitations; anchor it to the one real
population we have (the live pilot: 597 accounts, 593 documents, 49
groups — dated); and state the exact distributional assumptions
(posts/user, fan-out, comment/reaction ratios) so a reviewer can
re-run or re-weight. The claim shrinks to "under this stated workload"
— which is defensible; "scales to 1M users" full stop is not.

**2. "One vendor, one region, one hour."** DO nyc3, one instance per
point, and a single-digit number of runs invites "that's your box, your
day, your luck." *Mitigation:* ≥3 independent trials per point with
variance reported (not just medians); a second region or a second
provider at *one* scale (the 10k baseline) to show the curve is not a
box artifact; and the full provenance (revision, images, seed, config,
invoices) archived so anyone can replay. Cheap variance beats expensive
n=1.

**3. "Where is the comparison?"** This is the big one. An industry
track rewards operational experience, but an evaluation with *only*
web10 numbers is a system description with charts, not an evaluation.
The E3 baseline (PostgreSQL RLS, same shared-table shape, same data,
same workload, same box) is what converts "we measured ourselves" into
"we measured a tradeoff." *Mitigation:* the baseline is the same sweep
on the same ladder — the workload definition above is deliberately
engine-agnostic for this reason. If the deadline kills the baseline,
the paper must say so explicitly ("baseline comparison is future work")
and the claim must be feasibility/cost-of-web10, not
web10-vs-conventional. **Do not let the charts imply a comparison the
text doesn't make.**

**4. (The quiet one) "The numbers came from a harness you wrote to
produce them."** The harness is ours, the workload is ours, the SLO is
ours. *Mitigation:* the harness blockers list is public in the repo,
the failure curves include our own failures, and the connected social
runner (real browser, real auth, real feed path) is the
independent-check on the synthetic bench — two harnesses, one of them
application-real, agreeing in direction. That is the strongest
anti-embarrassment asset we have and it is already built.

**The sufficiency bar for the paper, stated plainly:**
- Scale sweep (this design) — the cost/latency/failure curves. ✓ designed
- Connected social runner execution — application-realism evidence. ✓ built, needs a droplet
- E3 baseline sweep — the comparison. ✗ unbuilt, deadline risk
- Live production observations — the real population. ✓ partial (28.10 pilot), needs a second dated snapshot
- Bounded conformance (E5) — the correctness floor under the same conditions. ✓ suites exist, needs the pinned revision + counts

With all five, the evaluation is sufficient for an industry track:
feasibility + cost + one real comparison + real deployment + bounded
correctness, with every limitation named. With the baseline missing,
it is still submittable *if* the claim is scoped to feasibility and
cost and the missing comparison is stated as future work in the
abstract-adjacent text, not discovered in the limitations. The
embarrassment failure mode is not a weak number — it is a claim/outcome
mismatch the reviewers notice before we do.

## The one-paragraph version

The Digital Ocean experiment is a disposable-host, co-located,
application-realism evaluation: a fresh droplet, a real browser journey
through real auth and the real feed path, repeated timed reloads with
warmups separated, interop joins with denial/grant/revoke cycles, and
evidence collected to a manifest before the box is destroyed. It answers
"does the authorization layer survive a real application workload, and
what does it cost per phase" — not "how many users does it scale to"
(legacy harness, still blocked) and not "how does it compare to
PostgreSQL RLS" (E3, unbuilt). The paper should report it exactly that
way, with the invoice, the failure modes, and the open gates named.

The scale-sweep question ("what hardware handles 1k/10k/100k/1M users?")
is the legacy harness's job: fix its eight validity gates, scope the feed
query to the reader's groups, then run a fixed-workload sweep across a
DO instance ladder (s-2vcpu-4gb → m-8vcpu-32gb) with ≥3 trials per
point, recording the latency-vs-concurrency curve, the failure curve,
and the SLO knee with the billed rate — that table is the E3 cost curve,
and it costs under $10 to produce. It is necessary but not sufficient:
the sufficiency bar is sweep + connected-runner execution + the E3
baseline (or an explicitly scoped claim without it) + a second dated
production snapshot + bounded conformance, with every limitation named
where the claim is made, not buried in the limitations section.
