# web10 - Research Paper Strategy

**Author:** Jacob Hoffman, web10 Inc.

**Target:** SIGMOD 2027 industry track

**Status:** drafting; comparative literature review and evaluation pending

**Updated:** 2026-10-28

## Paper Scope

web10 integrates **generic query composition with user-managed group/service
permissions**, illustrated by web10-social. Its per-user namespace is logical:
documents live in one shared ClickHouse `documents` table keyed by
`(author_key, doc_id)`, not one database or physical collection per user.
Applications define feed queries and service-namespaced content through shared
primitives; the node also supplies advertising, content-event, media and
result-preparation machinery.

This is a systems-integration and operational-experience contribution, not
the invention of IAM/RBAC, shared-table isolation, or user-controlled access.
The node is readable by design; do not imply operator-blindness. Creator
monetization is outside the paper's evaluation and does not define its gap.
No first-ever claim or universal literature gap is established.

Deployment provides an opportunity to collect experience, not a substitute
for measurements. Production counts, latency, cost and synthetic capacity
results remain pending. Do not imply that a simplified SQL benchmark measures
the full feed: the current nonempty path has three query calls plus content
views, with discovery and media fetches additional.

## Venue

Verified against the [official industrial-track CFP](https://2027.sigmod.org/calls_industrial_track_papers.shtml)
on **October 28, 2026**:

- Deadline: **Tuesday, November 24, 2026, 23:59 AoE**.
- Full paper: **up to 12 pages plus references**, ACM Proceedings `sigconf`
  format, with template spacing and margins unchanged.
- **Not anonymous:** include all author names and affiliations; at least one
  author must have a non-academic affiliation.
- **CMT is open:** [SIGMODIND2027](https://cmt3.research.microsoft.com/SIGMODIND2027).
- No simultaneous submission of substantially overlapping work elsewhere.

Internal freeze: **November 20**. The earlier workshop-first/CIDR ladder is
historical, not the current target. See `conferences.md` for historical notes;
the official CFP governs current logistics.

## Research Map

| Path | Purpose |
|---|---|
| `brief.md` | Bounded claim, scope and outstanding gates |
| `related-work.md` | Explicitly unverified comparison tasks, using the verified citation pack |
| `references/web10-references.bib` | Verified bibliography; not a completed gap analysis |
| `references/citation-mapping.md` | Placement guidance and unsupported-claim warnings |
| `evaluation-plan.md` | Production/synthetic separation, fair baselines and measurement gates |
| `experiments/README.md` | Known harness blockers; no runnable/reproducible claim yet |
| `draft/outline.md` | Industry-paper section plan |
| `workshop/main.tex` | Existing compressed draft, not evidence of completed evaluation |

## Remaining Gates

- [ ] Complete source-level comparisons, especially Solid WAC/ACP and query
  work, and narrow or withdraw any unsupported novelty distinction.
- [ ] Clear harness blockers before relying on experiment output.
- [ ] Collect attributable repeated trials and dated production observations.
- [ ] Build a matched shared-table policy baseline with the same data,
  permissions, outputs and resource budget; no physical per-user DB straw man.
- [ ] Report phase ratios separately from causal total authorization overhead.
- [ ] Record actual purchased hardware and cost, not assumed cheap-VPS prices.
- [ ] Confirm authorship, paper name and submission metadata; disclose that
  the author built and runs the system.

No manufactured measurements, conformance counts, security proofs, or claims
that unmeasured baseline policies are inexpressible.
