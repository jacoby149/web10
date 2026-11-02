# One-Page Brief - web10 Paper

## Claim

> We present web10, a systems integration of generic query composition and
> user-managed group/service permissions over logical per-user namespaces,
> illustrated by a social application built on the same generic node.

The node uses one shared ClickHouse `documents` table keyed by
`(author_key, doc_id)`, not a database or physical collection per user.
Applications define feed queries and service-namespaced content through shared
primitives; the node also supplies advertising, content-event, media and
result-preparation machinery. The node is readable by design, not operator-blind.

## Contribution and Boundaries

The contribution is the integration and a planned evaluation of its operational tradeoffs,
not the invention of RBAC, user-controlled access, shared-table isolation, or
SQL composition. web10-social is the case study, not proof of generality.
Creator monetization is outside this paper's evaluation and cannot define
its literature gap. No universal novelty or first-ever claim is established.

## Related-Work Question

How does this integration compare with Solid WAC/ACP and server/query work,
ActivityPub/ActivityPods, AT Protocol, established authorization systems and
shared-table policy enforcement? The precise gap remains **unverified**.
Use the verified bibliography and its placement guide, but do not confuse
verified citations with a completed comparative literature review. Tasks and
claim limits are in `related-work.md`.

## Evaluation Promise

Results are pending. Separate dated production observations from synthetic
capacity trials. Evaluate phase timings, total causal authorization cost,
matched shared-table policy baselines, actual hardware/cost and bounded
conformance evidence. A `readable/execute` phase ratio is not total overhead.

The current nonempty feed uses three query calls plus content views, with
discovery and media work additional; one simplified query is not the whole
page. See `evaluation-plan.md` and the prominent harness blockers in
`experiments/README.md`. The artifact is not yet validated as runnable or
reproducible.

## Venue and Remaining Gates

SIGMOD 2027 industry track: **November 24, 2026, 23:59 AoE**, up to **12 pages
plus references**, not anonymous, CMT open (verified October 28, 2026).
Official links and requirements: `README.md`. Internal freeze: November 20.

- [ ] Complete the comparative literature review and bound the distinction.
- [ ] Clear harness validity gates and collect repeated, attributable trials.
- [ ] Verify production observations and equivalent baseline results.
- [ ] Confirm paper name, authorship and final submission metadata.
