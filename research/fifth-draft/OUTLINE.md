# Fifth draft — authorized composition as the central argument

Written on 6 November 2026 after the operator requested a fifth draft.
Earlier manuscripts stay intact. The combined Mastodon/Bluesky comparison
is replaced with two new figures, giving 12 figures in the fifth draft.
Page length is not the writing constraint.

## The compression

Owning data includes controlling the relationships around it. web10
stores content and user-managed grants together, then compiles each
application query against authorized service relations before its joins
and aggregates execute. The social application, Snake, and Marketplace
exercise that shared backend. Cross-node certification demonstrates that
identity can be verified remotely while access stays local. A separate
domain-follow prototype demonstrates public address continuity, not
private-principal migration. Creator offers and operator overlays reuse
the substrate without taking a percentage of creator affiliate payouts.
The 1,000-group experiment identifies metadata round trips as a bottleneck
and measures batching's benefit and small-K cost.

## The comparison the operator asked about

AT Protocol already supports extensible records, cross-app reuse,
portable identity/data, and granular delegation. Do not use their absence
as web10's differentiator. The positive argument is a node-hosted query
service over a shared authoritative store, with group-controlled private
access as part of the common substrate. A new composition can avoid a
separate app-owned index/database/synchronization service. This is a
developer/infrastructure advantage for that workload, not a claim of
universal superiority, measured speed, or ecosystem maturity.

Mastodon is a separate comparison: stock social REST APIs and additional
application-owned data versus web10's common document/query backend.
Both new figures show the same three applications/clients on each side.
The AT figure draws repositories and opens the application's read backend
into record synchronization/webhook handling, a queryable database copy,
and server code serving a request. "AppView" is defined by those pieces,
not used as an unexplained box. Statusphere's pinned Tap/SQLite/Next.js
implementation grounds the example; the score/listing workload is an
illustration, not a claimed implementation in that tutorial. The figure
no longer depicts a social-only AT world opposite a multi-app web10 world.
The AT route also forks explicitly: reuse a read service whose data/API
fit, or design and build a custom one. A custom storage schema is not
prescribed: generic JSON vs typed tables, keys/indexes and update strategy
remain choices. web10's content services already share `documents`, with
service names and JSON bodies; the app still owns JSON conventions and
queries. The architectural advantage is supplied query/storage/access
infrastructure, not an unmeasured database-performance or MongoDB comparison.

## Section jobs

| Section | Argument | Figures |
|---|---|---|
| 1. Owning the content is not enough | Stakes → existing progress → the missing computation seam → five properties and evidence status | app-arch |
| 2. The rules are data | Documents, groups, app/content gates, latest-row semantics, operator-readable trust model | — |
| 3. One shared store | Local cross-author composition vs direct pod fetching; indexes can change the alternative | composition |
| 4. Your query | Output-filter failure → authorized input relations → implementation dependencies and RLS alternative | query-engine |
| 5. A new application | Social application → exact profile join → separate stock-Mastodon and AT query-service comparisons → browser result | groups, mastodon, atproto, interop |
| 6. Across nodes | Verification ≠ authorization; client read design separated from actual two-node proof; domain prototype separated from deployed follows | feed, audience-portability |
| 7. Advertising | Creator links vs operator overlays; operating choices vs measured exposure; hypothetical market vs observation | monetization, node-market |
| 8. Lessons | Four deleted shortcuts; runner ordering is not full schema-race closure; columnar operational cost | — |
| 9. Evidence | Five named questions; source/result records are the factual oracle | k1000-curve |
| 10. Positioning | Solid's authorization, AT's extensibility, existing database/access work; contribution is the integration | references to comparisons |
| 11. Conclusion | The working division of labor, demonstrated slices, specific next measurements | — |

## Claim/evidence checks

- Abstract's shared-query claim → §§2–5 and browser/HTTP interop controls.
- Foreign-principal claim → §6 and §9.2's isolated TLS lifecycle.
- Public-continuity claim → §6.1 and §9.3's separate configured prototype.
- Advertising payout policy → §7 and social ads/node-ads KB; no revenue experiment.
- 7.64 s → 363 ms → **handler** medians from K1000-RESULTS.md.
- 7.54 s → 214 ms → **readable-resolution** medians from that same record.
- Benchmark receipt is summaries, not a complete raw-sample archive.
- Figures are not allowed to reintroduce removed exclusivity/scale/market claims.

## Next gate

Operator read of the complete PDF, especially the AT comparison and the
balance of architecture, network, and economics. No submission-readiness
or complete related-work gap claim. Repeated trials, matched policy
baseline, full-feed/concurrency, production cross-node integration and
revocation bounds remain open.
