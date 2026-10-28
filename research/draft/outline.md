# Draft Outline - web10 Industry Paper

Target: **SIGMOD 2027 industry track**, November 24, 2026, **23:59 AoE**;
up to **12 pages plus references**, ACM `sigconf`, not anonymous, CMT open
(verified October 28, 2026; [official CFP](https://2027.sigmod.org/calls_industrial_track_papers.shtml)).
Internal freeze: November 20. The existing `research/workshop/main.tex` is
draft material, not a validated account of results. Comparative review and
evaluation remain pending; see `../brief.md` and `../related-work.md`.

## Sections

1. **Abstract:** the systems integration and only measured, sourced results.
   Write last; no invented headline or universal novelty claim.
2. **Introduction:** motivate user-managed data/access and generic query
   composition. State the integration contribution; creator monetization is
   not the evaluated gap.
3. **Background and Related Foundations:** RBAC/IAM, Solid WAC/ACP, social
   protocols, shared-table tenancy and policy-aware querying. Distinguish
   established primitives from web10's combination.
4. **System Overview:** one shared ClickHouse `documents` table keyed by
   `(author_key, doc_id)`; logical per-user namespaces, `doc_groups`,
   `group_contracts`, `group_members`, app trust and scoped tokens. The node
    offers generic composition alongside advertising, content-event, media and
    result-preparation machinery. Node-readable does not mean operator-blind
    or physically isolated per user.
5. **Query Composition and Permission Enforcement:** user-managed roles as
   per-service permission maps; principal classes and public read grants;
   app-contract checks, query restriction, compilation and prepare/media work.
   State consistency/revocation limits with evidence, not a formal proof.
6. **Evaluation:** follow `../evaluation-plan.md`. Separate production
   observations from synthetic trials. Report full phases and errors; a
   `readable/execute` phase ratio is not total overhead. Use a separate causal
   authorization ablation and matched shared-table policy baseline with the
   same data, access semantics, results and resources. Current nonempty feed:
   three query calls plus content views; discovery and media work additional.
   Harness gates in `../experiments/README.md` must close first. Results pending.
7. **Operational Lessons:** only documented production incidents and measured
   tradeoffs of shared-table logical namespaces, permission metadata and a
   generic node. Distinguish observed experience from design expectations.
8. **Related Work:** source-supported comparisons from `../related-work.md`,
   including Solid query/access work, Zanzibar, RLS/multi-tenancy and TAO.
   The verified bibliography does not itself verify a literature gap.
9. **Limitations:** unmeasured workloads, synthetic/production differences,
   baseline confounders, consistency/media revocation limits and bounded
   conformance coverage. Monetization and formal security proof are out of scope.
10. **Conclusion:** restate the integration and evidence actually obtained.
11. **References:** use `../references/web10-references.bib` and its mapping;
    cite each source only for claims it supports.

## Writing Gates

- Keep the system description aligned with implementation and the KB.
- Keep results as pending until validated; do not claim the artifact runnable
  or reproducible before its gates pass.
- Include author names/affiliations and disclose system ownership.
- Acknowledge contrary prior work; an industry integration report does not
  require an unsupported first-ever claim.
