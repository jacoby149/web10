# The experiments — what each is, why it was important, what it proved

The evidence map for the paper (theory §6: the evaluation is the proof of
the claims, organized as Q&A). Each entry: **What** (the experiment),
**Why it was important** (which claim/differentiator it proves — written
before the evidence is placed in prose), **Established** (verified, with
honest scope), **Evidence** (where it lives), **Open** (the domain stated
as fact), **Where in the paper**.

Claim classes: **architectural** (does the boundary hold?), **business**
(does a real app run on the generic node?), **scale** (where does the cost
live?).

---

## 1. The conformance / permission matrix — the theorem's proof

**What.** The node's conformance suite: the permission matrix across
services, groups, roles, and principal classes, plus the I3 negative
tests — exploits replayed and denied (red → green). The security
campaign ran the same discipline across the scope ladder (file →
call-graph → service → project-wide, backend-first), each repair gated
on a repro test: the exploit replayed and denied.

**Why it was important.** It is the *proof* of the central theorem (I3:
every query compiled through the boundary returns only documents in the
reader's readable set). Without it, differentiator #2 (fine-grained,
user-managed access) and #4 (composable, app-defined queries) are
assertions, not results. It is also the answer to "an engineering blog,
not a contribution": the contribution is the theorem, and this is its
proof.

**Established.** The suite passes at local scale (the full API test
suite plus subtests, per the security record — the writer pulls the
current counts from `knowledge-base/security/security-record.md` at
writing time, never from a draft). Disclosed findings from the campaign
were each repaired behind a repro gate; the retained open findings are
listed in the security record.

**Evidence.** `knowledge-base/security/` (security-record.md,
`scans/`), `api/app/v3/services/safe_query.py` + its test suite.

**Open.** Whole-project L1 closure, the remaining open findings, and
independent diverse review — stated in the forward scope, not scattered.

**Where in the paper.** §5 (the mechanism: the five-step compile +
round-trip) and §8 Q1 (the proof: the matrix + the replayed-and-denied
attacks).

---

## 2. Connected interoperability — the business claim

**What.** Two small static applications — a game (Snake) and a
marketplace — that read the social application's `profile` documents
through the same access boundary, with connected browser consent: real
browser, real node, no mocks. The game writes `snake_scores`; the
marketplace writes `marketplace_listings`; both read the social app's
`profile` service. No node change, no application-specific endpoint, no
API agreement between the applications.

**Why it was important.** It is the *business* proof of differentiator
#4: the killer app is a **producer of reusable data**, not the owner of
its backend. The one-sentence test that drove the design ("would a
notes app, a music app, or a shop use this?") is answered with a
running shop and a running game. It also carries Q1 (is it real?) — the
screenshots of the two apps reading one social-written profile are
evidence, not decoration.

**Established.** Verified on the committed integration: connected
browser consent, cross-author app/group controls, public reads working,
private reads correctly gated; desktop/375px receipts. The exact
service names and the connected flow are pinned in the paper's interop
table.

**Evidence.** `research/interoperability-demo/` (`http.spec.mjs`,
`client.test.mjs`, `figures/snake-identity.png`,
`figures/marketplace-identity.png`), paper §6 "Multiple applications,
one data plane" + Table (interop apps).

**Open.** Production rollout, receiving-app cache refresh, diverse
acceptance — forward scope.

**Where in the paper.** §6 (the multi-app beat, with the screenshots)
and §8 Q2 (the business claim).

---

## 3. The two-node IAM experiment — the federation proof

**What.** Two nodes with independently generated synthetic keys and real
test-CA HTTPS. The owner manages foreign grants on their home node; a
foreign reader presents the home-node token on the serving node; the
serving node asks the home issuer's `/certify` (one cached answer per
token, never a grant) and then re-runs the local access check on every
read. The lifecycle: granted → read → revoked → restored.

**Why it was important.** It is the architectural proof of
differentiator #3 (cross-node-addressable access: *verified, not
registered*) and the cross-node corollary of the theorem — the same
I3 re-run on a foreign store, after one cached certification. It is the
"the policy reaches across the network" claim made measurable instead
of aspirational.

**Established.** The bounded scenario passes on a clean merged-dev
revision with an empty patch (the H-REPLAY receipt gate, locally
satisfied): 34 events, owner-managed foreign grants, independent keys,
real test-CA HTTPS, verified cleanup. The historical method-size
failure is recorded, not waived.

**Evidence.** `research/federation-demo/` (`run.py`, `scenario.py`,
`test_lifecycle.py`, `RESULTS.md`), paper §4 "Implementation status".

**Open.** Production key provisioning, public-DNS timing, the
coordinated principal migration, private-principal continuity — named
in the forward scope. This is not production federation assurance.

**Where in the paper.** §4 (the linchpin + the boundary rule) and
§8 Q2 (the architecture + network claim).

---

## 4. Domain portability — the address outlives the account

**What.** The reader stores a **domain** (not an account address) in
their own data. The creator binds a DNS TXT record
(`web10.provider=…; web10.user=…`), verified by the node itself. The
creator then changes account and provider. The client re-resolves the
domain against the new provider; the **public** subscription survives
without re-following; the **private** grants stay behind (old source
still readable by the old principal only; new target's private reads
correctly denied).

**Why it was important.** It is the proof of differentiator #5's
deepest claim — that the network is *user-addressed*: the address
outlives the account, exactly as an email address survives a provider
change. It applies the patterns the web already uses for identity
claims (DKIM, SPF, `OpenPGPkey`) to a social identity, and it is the
email frame's payoff made concrete: the subscription follows the
person, not the platform.

**Established.** The isolated prototype passes the full desktop/375px
matrix on the committed integration: exact real-TXT claim, private
200-on-old-source / 403-on-new-target, unchanged-follow public reads,
no re-follow. Lab TLS/DNS/app-grant fixtures; three-component merge
dependencies explicit.

**Evidence.** `research/domain-portability-demo/` (`RESULTS.md`,
`figures/before-card.png`, `figures/after-card.png`), paper §4
"Domain aliases and public subscription continuity" + §8.

**Open.** Production integration, public-DNS timing, absolute
unbannability (legal ownership and remedies depend on terms and
jurisdiction — out of scope, stated as fact).

**Where in the paper.** §4 (domain aliases) and §8 Q2 (the
user-addressed claim).

---

## 5. The K10/K1000 fan-out — where the cost lives

**What.** A seeded droplet (K = 10 / 100 / 1000 creators), a reader
following all of them, the metadata resolution measured: the per-group
`readable` phase (the access decision — the claim's core metric) versus
the document scan it feeds. One sequential trial per K; cells =
ranking/filter combinations; 20 samples per cell at K1000 (400
measurements). The question the experiment was built to answer: does
the columnar engine make reads cheap, so latency must live in the
engine?

**Why it was important.** It is the *scale* proof — and it answered with
a counterintuitive result: at 1,000 followed creators, the per-group
metadata resolver's median readable time was **7.64 s** while the
document scan it fed was already done. The authorization machinery, not
the database, was the bottleneck. That measurement drove a real design
decision (the batched resolver: three metadata queries + in-memory
resolution → **363 ms** median) — and carries the honest counterweight
in the same table: at one candidate group, the per-group path is
*faster*, because three fixed round trips dominate. The number that
hurts is reported next to the number that sells.

**Established.** K100 (100 creators, 15 cells × 20 samples) and K1000
(20 cells × 20 samples, single sequential trial) recorded; the table
data is verified against the committed report by the check-paper
harness.

**Evidence.** `research/experiments/costfn/` (`K100-RESULTS.md`,
`K1000-RESULTS.md`, `bench.py`, `seed.py`, `check-paper.mjs`), paper
§8 (the metadata fan-out table).

**Open.** Repeated trials (variance), full-feed latency (page assembly,
media delivery), capacity trials, attributable hardware — the E3
follow-through; stated in the forward scope.

**Where in the paper.** §8 Q3 (the scale claim) and §7 ("the first
measurement pointed at the access layer, not the database").

---

## 6. The operating point — the labor made visible

**What.** The deployed node serving real users: the social app plus the
interop apps, the static frontend, the media pipeline. The production
snapshot (28.10.2026): 597 account rows, 593 live documents, 49
groups, 1,298 memberships. The application frontend measured at 46,285
physical source lines across 141 files, pinned to the artifact
revision.

**Why it was important.** It carries Q1 (is it real?) and the labor
lede: a whole highly technical system, built and running, with the
pinned line counts (958,824 added / 568,594 deleted across the
project) as the "we did the labor" signal. The industry track rewards
operational experience; this is the evidence that the experience
happened.

**Established.** The live snapshot collected; the social app + game +
marketplace running on the node; the frontend size pinned to the
reviewed snapshot revision.

**Evidence.** `research/live-observation-2026-10-28.md`, paper §1
(the labor) + §6 (the frontend measurement), artifact pins.

**Open.** The E1 full counters (activity, volume, window, exact
running-build evidence); the scale framing decision (print the small
number as honesty + lean on K1000, or wait for E1) is the operator's —
theory §15 question 3, the highest-risk reviewer question.

**Where in the paper.** §1 (the labor lede), §6 (the frontend pin),
§8 Q4 (the cost-of-the-alternative: the matched RLS baseline, open
with its design stated).
