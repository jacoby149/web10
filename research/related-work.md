# Related Work - web10

**Status: comparative gap UNVERIFIED; review tasks remain open.** The verified
26-entry [bibliography](references/web10-references.bib) and
[citation mapping](references/citation-mapping.md) supply citation metadata
and claim-placement guidance, not proof that literature verification or the
comparison is complete. Do not infer missing functionality from a venue's
prestige, a sparse publication record, or silence in one cited paper.

The question is how web10 integrates generic query composition with
user-managed group/service permissions over a shared-table logical namespace.
It is not whether anyone previously combined ownership, IAM and monetization:
monetization is out of scope. No universal absence or first-ever claim follows.

## Comparison Tasks

| Prior work | Verified bibliography keys | Open comparison, not an established gap |
|---|---|---|
| Solid and Community Solid Server | `solid2016`, `solid-demo2016`, `solid-apps2016`, `solid-protocol2024`, `css2024` | Inspect current server and cross-Pod query work; compare composition, deployment and trust boundaries. Do not assert Solid never shipped or cross-Pod querying is impossible. |
| Solid authorization | `wac2022`, `acp2022` | WAC has `acl:agentGroup`; ACP includes client/issuer matchers. Compare these with per-service role maps, grant lifecycle and query enforcement; do not call Solid group/client authorization absent. |
| ActivityPub and ActivityPods | `activitypub2018`, `activitypods` | Separate the W3C protocol from framework implementations. Inspect actual authorization/query behavior; the ActivityPods project page alone cannot establish a technical gap. |
| AT Protocol | `kleppmann2024` | Compare repositories, AppViews, visibility and authorization as described, then check relevant current work. Do not infer all implementation limits from the 2024 paper. |
| RBAC, ABAC and IAM | `ferraiolo1992`, `sandhu1996`, `abac2014`, `awsiam` | Established foundations, not missing inventions. Explain the integration's user-facing policy management without claiming IAM was never exposed to end users. AWS documentation is not performance evidence. |
| Relationship/global authorization | `zanzibar2019` | Compare relationship modeling, consistency and revocation semantics. No equivalent scale or consistency claim for web10 without evidence. |
| Shared-table multi-tenancy and RLS | `jacobs2007`, `aulbach2008`, `force2009`, `postgres-rls` | Direct antecedents: logical tenant isolation in shared storage. Compare equivalent policies and query composition; do not portray web10 as physical DB-per-user or policies as inexpressible in RLS. |
| Storage and social systems | `clickhouse2024`, `tao2013` | Separate storage design and deployed social-read precedents from web10's own unmeasured performance. Neither source establishes web10 authorization correctness. |

## Before Freezing Related Work

- [ ] Read the relevant primary sources and record version/section evidence
  for each technical comparison, including counterexamples and close threats.
- [ ] Search Solid query/access-control and generic policy-aware composition
  work beyond this pack; record search scope, date and exclusions.
- [ ] Identify the closest integration and state a narrow, source-supported
  design distinction. If not supported, frame this as an integration and
  operational-experience report rather than inventing a novelty gap.
- [ ] Separate documented design differences from measured comparisons;
  performance and cost comparisons remain pending in `evaluation-plan.md`.

**Gap decision: OPEN.** Citation verification does not close these tasks.
Do not claim competing systems lack fine-grained access, deployed scale, or
query capabilities without direct, scoped evidence.
