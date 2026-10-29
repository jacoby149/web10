# Evaluation Plan - web10 Paper

**Status: partial live observations collected; formal evaluation pending.**
The [28 October Ubuntu pilot](live-observation-2026-10-28.md) records 597 live
account rows, 593 live documents, 49 groups and nine authenticated browsing
checks, with exact readiness definitions and limits. It supplies neither active
user counts nor phase/capacity/comparative results. The current harness has known
[blocking defects and validity gaps](experiments/README.md#known-blockers).
Resolve those gates before collecting paper numbers.

Target: SIGMOD 2027 industry track; November 24, 2026, 23:59 AoE;
internal freeze November 20. See [submission requirements](README.md#venue).

The [connected social runner](experiments/social/README.md) supplies an isolated
application/correctness and timed-reload procedure, separate from the legacy
query harness. It is implemented, not yet a completed droplet experiment. It
excludes P2P/media playback and capacity/scaling comparisons; E2-E5 remain open
until the required workloads run and their evidence is reviewed.

## System and Contribution

web10 stores documents in one shared ClickHouse `documents` table keyed by
`(author_key, doc_id)`. A user's namespace is logical, not a separate database
or physical collection. The systems-integration contribution to evaluate is
generic query composition with user-managed group/service permissions.
Neither RBAC nor shared-table tenant isolation is claimed as new.

## E1 - Scale and Provenance

- [✓] Pilot snapshot: hardware, software, live account/document/group/membership
  counts and three repeated route observations recorded on 28 October; see the
  linked report. Complete E1 still needs activity/volume/window and build evidence.

- [ ] Record dated production counts: registered/active users, logical author
  namespaces, documents, groups, memberships, access volume, media volume,
  deployment duration and observed uptime (with observation windows).
- [ ] Label production observations, production replays and synthetic trials
  separately. Synthetic user counts are not active-user evidence.
- [ ] Preserve revision, configuration, workload seed and data provenance.

## E2 - Query and Authorization Latency

- [ ] Measure client latency and server p50/p95/p99, throughput, errors and
  timeouts across load levels, with warm-up and repeated trials.
- [ ] Report all query phases, including `auth`, `app_contract`, `candidates`,
  `readable`, `group_meta`, `compile`, `execute` and `prepare`; identify which
  phases contain authorization work or mixed responsibilities.
- [ ] Label `p50(readable) / p50(execute)` only as a phase ratio. It is not
  total authorization overhead, a percentile of per-request ratios, or a
  causal estimate. Authorization work is not confined to `readable`.
- [ ] Measure causal authorization overhead separately using an isolated,
  synthetic-only ablation with equivalent preauthorized result sets, matched
  resources/cache conditions and repeated paired trials. Record query-plan
  changes as part of the treatment and report the total latency delta and checks
  removed. A separate fixed-plan experiment can isolate metadata orchestration;
  never disable production checks.

## E3 - Matched Shared-Table Baseline and Cost

Both web10 and the baseline must use shared tables with logical tenant keys.
Compare web10's query-layer policy enforcement with a conventional shared-table
backend implementing equivalent group/service policies (for example PostgreSQL
RLS plus the required application logic). No imaginary physical per-user
database baseline and no assumption that RLS cannot express these policies.

- [ ] Match data, access semantics (including private/denied reads), returned
  rows/fields/order, query functionality, concurrency and resource budgets.
- [ ] Publish baseline policy/schema/index choices and result-equivalence
  checks; separate database-engine differences from authorization effects.
- [ ] Measure storage/metadata, CPU, memory, I/O, latency and throughput over
  scale. Record actual purchased instance specs, region, dates and invoices;
  distinguish provisioned capacity cost from per-run spend and media/egress.
- [ ] Report tradeoffs without claiming isolation or ownership semantics are
  inexpressible in a shared-table baseline. The baseline is not built yet.

## E4 - Application Workload

The current nonempty feed path is **three query calls plus a content-views
request**, with discovery/group resolution and media fetches additional
(`marketing/web10-social/src/data/feed.ts`, `readFeedPage` and
`readFeedEngagementCounts`).
Do not describe the whole page as one request or use historical 267-to-1
counts as a current end-to-end measurement.

- [ ] Separate a simplified SQL microbenchmark from the current feed path.
- [ ] Cover prepare/media/face work, discovery, public/private groups, denied
  reads, membership changes and revocation; specify the workload mix.
- [ ] Measure page readiness and request counts, not just one SQL response;
  compare equivalent baseline outputs and functionality.

## E4b - Multi-App Generality Demonstration

Full specification: [`multi-app-demonstration.md`](multi-app-demonstration.md).

Correctness tooling now exists in `experiments/social/interop.mjs`: distinct-Origin
score/profile and listing/profile joins over social-produced profiles, app-grant
denial/regrant/revocation and independent private-group exclusion. Offline tests
verify orchestration only. Connected execution and browser app artifacts remain
open; run through the disposable-host gate in `experiments/social/README.md`.

The paper claims the node is a generic data platform, not a social backend.
A single demonstrated application (web10-social) does not establish that claim.
E4b specifies a three-part demonstration:

1. **web10-social (Developer A)** — the full social app, already built. The star.
2. **"Most Popular on web10"** — a same-domain analytics probe: one query over
   the same services, author-aggregation semantics instead of reader-scoped feed.
3. **Developer B's apps (Snake + Marketplace)** — cross-domain, cross-developer:
   a game and a commerce app that read web10-social's `profile` documents
   (avatars, walls) and store their own domain data (`high_scores`, `listings`).
   web10-social is unchanged. No inter-app API agreement.

The critical property: Developer B's applications read Developer A's data
through the user's grants and the same query boundary, with zero changes to
Developer A's application. The data is the user's, not the app's.

- [ ] Validate the "Most Popular" leaderboard query against the live node.
- [ ] Build the "Most Popular" static page.
- [ ] Write the seed script for `high_scores` and `listings` documents.
- [ ] Build the Snake static page (cross-domain join: `high_scores` + `profile`).
- [ ] Build the Marketplace static page (cross-domain join: `listings` + `profile`).
- [ ] Validate the combined "Friends & Scores" query against the live node.
- [ ] Confirm the node has no app-specific surface for games/commerce/leaderboards (D60).
- [ ] Screenshot each page (desktop + 375px mobile).
- [ ] Draft the §3.4/§3.5 expansion with the multi-app table and narrative.
- [ ] Link all static pages as paper artifacts (pinned revision).
- [ ] Decide title: "Social Data Platform" vs. "User Data Platform".

This is a generality demonstration, not a performance comparison. The game and
marketplace are not workloads for E2/E3. Their smallness is the argument.

## E5 - Bounded Conformance Evidence

- [ ] Cite exact revision, executed suites, case counts, results and exclusions.
- [ ] Test own-author reads and authorized cross-author reads, plus denial
  without a qualifying grant. I3 permits cross-author access through grants.
- [ ] Measure revocation visibility and residual media URL validity separately.

Passing cases provide bounded evidence, not proof of all invariants, formal
security, or completed security review. Report failures and untested paths.

## E6 - Validity and Reporting Gates

- [ ] Clear the harness blockers linked above; validate login, JSON token,
  Origin/app-contract path, workload coverage and returned results.
- [ ] Correlate logs to this run's requests; record actual active readers,
  successes, failures, rate limits, timeouts and sample counts.
- [ ] Repeat trials with documented warm/cold conditions and uncertainty;
  archive raw observations, commands, environment and limitations.

Only then fill abstract placeholders with sourced measurements. Production
experience and synthetic capacity experiments must remain separately labeled.
