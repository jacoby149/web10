# web10 - Research Paper Strategy

**Author:** Jacob Hoffman, web10 Inc.

**Target:** SIGMOD 2027 industry track

**Status:** title "Your Data, Your Rules: Extending the Decentralized Web."
The bounded [two-node IAM run](federation-demo/RESULTS.md) now exercises real
HTTPS home certification and owner-granted foreign access, removal and regrant
under cached identity. Its tested source includes the owner-list repair in
#1360; clean-base replay after that prerequisite merges remains open. The
12-page manuscript includes this evidence without claiming full migration,
foreign self-join, browser enrollment or production federation.

**Updated:** 2026-11-03

## The Thesis (read this first)

> Email decentralized where your data *goes*. web10 decentralizes who can
> *access* it — a uniform, user-managed access model where any principal on
> any node can hold any role in your groups, over the same user-addressed
> architecture, generalized from one data format (mail) to all data formats.

Full direction, the three-property triangle, the built-vs-in-flight honesty
bar, and what changed in the draft: **`decentralized-iam-thesis.md`**.

The old framing ("systems-integration / operational-experience report,"
"single-node, federation is future work") is superseded. The system is a
federation of nodes by design (D84); the draft was hedging *false to the
system*, not just timid. The email analogy is what makes the bold title
load-bearing: the decentralized part is an inheritance from email, not an
aspiration.

## Paper Scope

web10 is a **user-addressed network**: a federation of sovereign nodes in which
the user's client mediates cross-node reads, each node re-authorizes every read
against a verified token, and the access model is globally addressable by
construction. Content and access relationships live in a shared columnar data
plane (one ClickHouse `documents` table per node, keyed by
`(author_key, doc_id)`); applications define their own queries over
service-namespaced documents; users manage group membership and service-scoped
grants through a uniform permission vocabulary. The node also supplies
advertising, content-event, media, and result-preparation machinery.

The node is readable by design; do not imply operator-blindness. Creator
monetization is outside the paper's evaluation and does not define its gap.
No first-ever claim or universal literature gap is established — the claim is a
*generalization* of email's 50-year-old model (one format → all formats,
content routing → access control) plus a query layer, not a universal novelty
gap. The related-work gap remains OPEN (`related-work.md`); the framing is the
generalization, which is safer.

Deployment provides an opportunity to collect experience, not a substitute
for measurements. Formal production characterization, cost and synthetic
capacity results remain pending. A [live Ubuntu pilot](live-observation-2026-10-28.md)
now records dated aggregate counts and nine authenticated browsing checks;
formal capacity and comparative evaluation remain open. A preliminary
[K=10/100 trial](experiments/costfn/K100-RESULTS.md) records earlier phase-level
timings for a simplified query. The manuscript's main table now uses the later
[1,000-creator K=10/100/1000 trial](experiments/costfn/K1000-RESULTS.md) from
PR #1313, with a retained [machine-readable summary receipt](experiments/costfn/evidence/).
The datasets, hosts and source revisions differ; their samples are not pooled.
Do not imply that a simplified SQL benchmark measures
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
| `decentralized-iam-thesis.md` | **The paper's spine (read first).** The email generalization, the three-property triangle, the built-vs-in-flight honesty bar, what changed in the draft, the overclaims to avoid. |
| `cross-node-iam-demo.md` | The experiment that closes the last gap: a foreign principal granted into a group on another node, reading through the verified token, then removed and denied. Spec, blockers (H/A/B/C), minimal scope, decision gate. Does not block the draft. |
| `federation-demo/` | Local two-node TLS correctness harness, one completed base-plus-patch run, status-only receipts and independent key/group/app/namesake controls. Depends on owner-list repair #1360; not clean-base/public-deployment evidence. |
| `brief.md` | Bounded claim, scope and outstanding gates (pre-reframe; the thesis doc supersedes its framing) |
| `source-map.md` | Commit-pinned demonstration source counts, backend boundary and artifact links |
| `live-observation-2026-10-28.md` | Actual Ubuntu dataset/hardware snapshot and bounded authenticated browser pilot |
| `related-work.md` | Explicitly unverified comparison tasks, using the verified citation pack |
| `references/web10-references.bib` | Verified bibliography; not a completed gap analysis |
| `references/citation-mapping.md` | Placement guidance and unsupported-claim warnings |
| `evaluation-plan.md` | Production/synthetic separation, fair baselines, measurement gates, and the E4b multi-app generality demonstration |
| `multi-app-demonstration.md` | Three-part generality proof: web10-social + "Most Popular" probe + Developer B's Snake/Marketplace reading social profiles cross-app. Snake + Marketplace are built and hosted at `/docs/snake/` + `/docs/marketplace/` on the marketing UI, with the `/docs/interop` story page and an e2e gauntlet capturing screenshots |
| `digital-ocean-thinking.md` | Pre-mortem of the droplet evaluation: what each harness can claim, epistemic boundaries, cost/evidence rules, decision points |
| `cloudflare-plan.md` | Media-delivery offload plan: CDN stack, the free-vs-paid auth decision, Parts A/B/C (images / edge-verified HLS / takedown fast-path), and the dollar answer |
| `experiments/README.md` | Known harness blockers; no runnable/reproducible claim yet |
| `experiments/costfn/` | Cost-function harness and separately recorded 100-creator and 1,000-creator trials. Main paper table: K10/100/1000, 20 cells, 400 samples; A is a direct precompiled scan baseline, B/C compare per-group and batched resolution. Summary receipt and table checker retained |
| `draft/outline.md` | Industry-paper section plan |
| `workshop/main.tex` | The paper (12 pp including references, builds with tectonic; no horizontal overflow, remaining font/underfull and small final vertical-box warnings). Includes cross-app browser evidence and the isolated two-node base-plus-patch correctness result; broader federation/performance/security gates stay open. |

## Remaining Gates

The dedicated browser runner and evidence instructions live in
[`interoperability-demo/`](interoperability-demo/). Its connected desktop/mobile
consent and join flows plus independent HTTP app/group controls now pass; see
[the dated results](interoperability-demo/RESULTS.md). This does not close the
full social-feed/performance evaluation or establish distinct browser origins
for the two marketing-hosted demo apps.

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
