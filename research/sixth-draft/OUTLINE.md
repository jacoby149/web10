# Sixth draft — authorized composition, priced alternatives, bounded evidence

**7 November:** replacement experiment is in setup/design review only; no run or
new measured values. See `../experiments/costfn/STUDY.md` and `DESIGN-REVIEW.md`.
Do not freeze or infer submission readiness from generated data, offline request
capture or a proposed load matrix. Execution requires a new explicit approval.

6 November 2026. Refinement of v5 (`8d7460d8`, PR #1409), not resynthesis.
The initial exact-copy build matched v5's 14 pages and extracted text on
all pages (`.context/sixth-draft/baseline.json`). All earlier drafts remain
unchanged. **The tier-max follow-up was cancelled at 9/20 cells; replacement
work separates frozen inputs, restoration and measurement. No complete new
result is integrated; final freeze and upload readiness are OPEN.**

## The compression

Owning data includes controlling its relationships. web10 stores content
and user-managed grants together, then compiles app-authored queries against
authorized inputs before joins and aggregates execute. The deployed social
app, Snake, and Marketplace exercise that backend. Solid's pod composition
requires resource fetching or an extra index/query service. AT permits custom
records; its custom indexed view costs sync, app database and serving code,
while an existing fitting AppView avoids construction. web10 supplies that
query infrastructure. Millions of pooled authors is a sizing target, not
load-tested capacity. One historical fan-out trial motivates batching but
is not a repeat, causal overhead estimate, concurrent load result, or proof
of a deployed-batched endpoint default.

## Section map

| Section | Job | Included figures/tables |
|---|---|---|
| 1. Owning the content is not enough | Stakes-first entry, AT custom-path cost, common composition seam, five properties and evidence status | Fig. 1 app architecture |
| 2. The rules are data in the store they protect | Documents, group/app gates, version ranking and operator-readable trust model | — |
| 3. One shared store changes where composition happens | Millions as sizing, pod fetch/index fork, colocation costs; building the real app rather than assuming unpaid developer adoption | Fig. 2 composition |
| 4. Your query, over the relations you may read | Authorized inputs before computation; constrained AST path and its limits; intended paired same-engine baseline | Fig. 3 query engine |
| 5. A new application without a new data backend | App-authored/node-executed ranking; real social-written profile reuse; stock Mastodon interface; AT reuse/custom fork and three backend jobs; genericity status open for ads/Discover | Figs. 4 Mastodon, 5 AT, 6 interop |
| 6. Across nodes: identity is verified, access stays local | Certification is not a grant; client-mediated read design vs demonstrated isolated two-node slice | Fig. 7 cross-node design |
| 6.1. A public subscription that outlives an account | TXT indirection, separate lab client, public continuity not private authority migration | Fig. 8 domain follow |
| 7. Advertising without owning the creator's payout | Pinned offers vs overlays; off-platform payouts, separate operator revenue; no measured market/exposure outcome | — |
| 8. Lessons from building and operating the node | Removed shortcuts, runner ordering vs schema-readiness, analytical engine/version/point/tenant costs; genericity audit still open | — |
| 9. Evidence | Five questions; primary RESULTS records are the factual oracle | Fig. 9 historical curve; Tables 1–2 |
| 9.1. Can another application reuse social-written data? | Actual social app profile write reused by synthetic browser/HTTP interop, grants/revoke controls; shared-origin boundary | Fig. 6 referenced |
| 9.2. Can a foreign principal read, lose access, and read again? | Isolated qualified-principal lifecycle under cached identity certification; local grants rechecked | Fig. 7 referenced |
| 9.3. Can a public subscription survive the old provider's loss? | Real local DNS flip/old API loss, unchanged public follow, no private transfer | Fig. 8 referenced |
| 9.4. Where does readable-group resolution become expensive? | Historical B p50/p95 table, old A/C scope, K=1 counterweight; proposed million-user funnel clearly not results | Fig. 9; Table 1 B cells; Table 2 proposed funnel |
| 9.5. What does the deployed operating point show? | Entire dated 28 Oct snapshot, including 5,396 ms page readiness; no activity/capacity extrapolation | — |
| 10. Positioning the combination | Solid authorization and apps, priced AT custom view, shared-table/access antecedents; social-app development as design choice | Comparison references |
| 11. Limitations | Historical trial/default, full-feed multiplicity, genericity, shared origin, parser/media, lab DNS/TLS, incomplete federation/portability, economics | — |
| 12. Conclusion | Same combination and app proof, same sizing/AT/evaluation scope; specific open work, no retired migration slogan | — |

## Figure set and page budget

Nine full-width figure floats (ten raster images including two interop
crops), plus two tables. No figure barriers or smaller document fonts.
Group UI and hypothetical node-market floats were cut first; the advertising
float was cut after evidence/limitations still exceeded the budget. Its
standalone asset remains, without density targets, but is not in the paper.
AT/Mastodon comparisons, evidence, and Lessons remain. Current measured
PDF is **13 pages: 12 body pages + one references page (references begin
p13 with no body spill)**. Detailed warning/verification records are in
DECISIONS.md: no overfull boxes or unresolved citations/references;
font/underfull/BibTeX metadata diagnostics remain.

## Evidence/claim alignment

- 7.64 s → 363 ms is historical **handler**, not readable time.
- 7.54 s → 214 ms is historical **readable-resolution** time.
- Table 1 restores B handler/readable p50/p95 for both resolvers at all
  K=10/100/1000. K=1 discover remains a different workload on the dashed
  curve leg with open markers; batched handler growth remains 4.47×.
- Historical endpoint and current setting default are per-group; no newly
  deployed-batched receipt. Summary retention is not raw-sample retention.
- Table 2 low/likely/high funnel is proposed arithmetic, not performance.
  Registered authors, MAU, sessions, think time, request rates and in-flight
  requests are distinct. No million-author concurrency result is present.
- Intended overhead baseline: paired same ClickHouse, data, host and
  rows/order; not an absolute Postgres RLS vs ClickHouse race.
- Ranking policy is app SQL, node execution. Ads/Discover retain node
  infrastructure; cross-app reuse is not completed D60/E4b compliance.
- Solid 2016 papers establish demonstrations, not an unsupported 2026
  adoption census. Building the primary app is our design choice.
- Twenty-two cited local bib entries; comparison bib/checker unchanged.
  Diagram checks verify layout/structure only, never runtime correctness.

## Next gates

Task 4's first provisioning attempt failed HTTP 422 for the restricted
8-vCPU host. The operator then approved the largest listed four-vCPU host
(12 GB), subsequently cancelled at 9/20 cells and deleted. Frozen synthetic
inputs are generated/validated separately for the replacement experiment;
no complete new trial is available. Run the independent
repeat, keeping tier-limited configuration separate from shipped-default
deployment evidence, then build the paired
same-engine baseline with raw samples, warm-up exclusion and randomized
order. Million-author stepped load, full-feed timing, production cross-node
integration, revocation bounds, broader correctness and operator PDF review
remain open. Do not freeze, submit, or claim upload readiness.
