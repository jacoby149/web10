# Derived realism dataset — operator decisions

**Authority:** Jacob, 11 November 2026. This record supersedes the additive
dataset framing, blended authorship targets and conflicting paper briefing in
[REALISM-RERUN-PLAN.md](REALISM-RERUN-PLAN.md). The study programme, correctness
and performance gates, uniform substrate and freeze discipline otherwise stand.

**Current authorization:** implement the new generator, independent oracle,
validator and research-runner integration; perform feasibility checks and local
10k/100k floors. No paid provisioning, uploads or spend until those gates pass
and the generated statistics receipt has been presented for operator review.
Preparation is not a completed experiment or a production change.

## Conversation decisions

The operator approved the newer, all-DigitalOcean realism rerun, not a return
to the superseded local-only study. Execution remains pilot-first: generate
once, eventually upload the approved frozen store, import it on identical
droplets, report the pilot before the full parallel fan-out. Dataset generation
and validation precede any paid provisioning.

The first preflight found that the original V2 fixture gives each of 1,000,000
creators a post, plus 20,000 reader accounts: about 1.96% nonposting. An additive
layer cannot turn that into 85% nonposting. No droplet or upload was created.
Read-only account/catalog checks found an active DO account, no running
droplets and a candidate `s-8vcpu-32gb-amd` (8 vCPU, 32 GiB, $0.25/hour).
Catalogue availability is not proof of account-tier provisioning eligibility,
an approved budget or an independent cleanup watchdog. The original local
preflight is `.context/realism-preflight.json`; that ignored file is not the
durable authority for these decisions.

The operator's implementation approval, verbatim:

> APPROVED — build a derived realism dataset.
>
> The adopted realism targets override preserving an additive layer.
> Keep all V2 files and receipts untouched. Create a new generator,
> dataset identity, manifest and independent correctness oracle.
>
> Do not merely relabel authorship on existing posts. Generate activity,
> popularity, follows, posts, timestamps, engagement and impressions as
> one coherent joint model. Validate the marginal distributions,
> conservation identities, referential integrity, joint correlations and
> per-cell feed-candidate distributions on small floors before the 1M
> build.
>
> Also update the runner to the declared 28 GiB container cap / 22 GiB
> ClickHouse server limit and remove the one-post-per-creator oracle.
> Amend the plan terminology from “base + realism layer” to “derived
> realism dataset.”
>
> No paid droplet provisioning until the generator and validator pass
> and the generated statistics receipt is ready for review.

A second consistency check found that 85% nonposting, top 1% producing 70%
and top 10% producing 80% cannot coexist. For ranked post counts, the first
two force top-10% share ≥89.3%; even the earlier ±5-point share tolerances
cannot rescue that blended target set. The operator accepted this finding and
supplied the directive below: van Mierlo alone governs authorship; the Pew
target is withdrawn, not blended or retained as a paper cross-check.

The operator also explicitly requested durable repo capture:

> make sure this goes into the markdowns the stuff from this conversation dont want to lose it.
> i.e. get it in the plan in the repo etc.

## Governing directive — supplied by the operator

The supplied attachment's text is preserved below, verbatim, so a fresh
workspace does not depend on chat history or a gitignored attachment.

```text
Realism dataset — operator decisions
Date: Nov 11, 2026 · From: Jacob (operator) · To: the workspace
Status: directive. Where this document conflicts with
REALISM-RERUN-PLAN.md (the "base + realism layer" framing, the §3
authorship targets, or the §10 briefing), this document wins. Everything
else in the plan — study programme, gates, envelope, freeze discipline —
stands unchanged.
1. Decisions in one page
The realism dataset is a derived dataset, not an additive layer.
   The preflight contradiction is accepted as real: the frozen V2 base
   gives essentially every creator a post (~2% of accounts nonposting),
   so no additive layer can reach the adopted ~85% never-posting target.
   Realism targets override implementation convenience.
One source per quantity. Each measured quantity in the dataset is
   governed by exactly one literature source. Contradictory citations
   are omitted from the paper rather than blended. (Different sources
   for different quantities are fine — they never compete.)
Authorship is anchored solely on van Mierlo (2014). Pew's
   top-10% = 80% figure is not used for authorship anywhere — not as
   a target, not as a cross-check in the paper. Contract in §4 below.
Build and validate the generator before any paid provisioning.
   No droplets, uploads, or spend until the generator + independent
   oracle pass on small floors and the statistics receipt is ready for
   operator review.
2. The derived dataset (replaces "base + layer")
The original V2 files and all base-series receipts stay untouched,
  as provenance and development history (keep every iteration, as
  always).
Build a new generator producing a separately identified dataset:
  new name/identity, manifest, seed, hashes. Suggested identity:
  web10-social-1m realism-derived v1 (workspace may refine the name;
  it must not reuse a V2 dataset ID).
An independent correctness oracle is required. The existing
  runner's one-post-per-creator oracle is retired for this dataset.
The runner's memory allocation is updated to the declared envelope
  (28 GiB container cap / 22 GiB ClickHouse max_server_memory_usage).
Plan and paper terminology changes everywhere: "derived realism
  dataset," never "unchanged base plus an additive layer."
3. Why not just relabel authorship
Redistributing existing post rows among ~15% of accounts would fix one
statistic and leave an incoherent population behind. The generator must
model the population jointly:
Accounts carry latent activity/popularity; posting, follows,
  engagement, and impressions are generated from those traits, so the
  correlations point the right way (active, widely followed authors
  produce and receive more; dormant accounts do not own viral posts).
The follower graph and the hot/dispersed study cohorts are rebuilt
  under the same model. Following is biased toward active accounts, as
  on real platforms; K still denotes the declared number of follows.
Timestamps are plausible: a multi-thousand-post author's work is
  spread over time, not burst at one synthetic instant.
Every reaction, comment, group link, and delivery event references a
  document/account that exists, with consistent timestamps/visibility.
"Posting" means original posts. Profile documents do not count.
  Report original-post participation separately from accounts that only
  like or comment.
4. The authorship contract (van Mierlo only)
The workspace's consistency finding is accepted: 85% nonposting +
top 1% ≈ 70% + top 10% ≈ 80% cannot coexist (the first two force the
top-10 share to at least ~89.3%). The blended target set is withdrawn.
Authorship is calibrated to van Mierlo's jointly measured split:
Quantity
Adopted value
Note
Accounts that never post (original posts)
85%
Inside van Mierlo's measured bound (<25% of actors ever posted)
Share of posts by top 1% of accounts
74.7%
van Mierlo weighted average
Share of posts by next 9% of accounts
24.0%
van Mierlo
Share of posts by bottom 90% of accounts
1.3%
van Mierlo (the posting part of this band is the 5% of accounts between the 85% zero line and the top 10%)
Share of posts by top 10% of accounts
98.7%
Derived (74.7 + 24.0). Never a separate target.
Generator acceptance: the generated store's authorship statistics must
match this contract within the plan's declared tolerances, verified from
the statistics receipt — not assumed from generator parameters.
5. Paper text — why van Mierlo, not Pew (for §10 / dataset section)
Include this justification (light edits for flow are fine; the argument
must survive intact):
For authorship we adopt van Mierlo [2014] as the sole source, in
preference to the widely cited Pew Twitter figures. Van Mierlo's
data are a complete server-side census of four social networks
(63,990 accounts, 578,349 posts), in which the full authorship
distribution — including the class of accounts that never post
(<25% of accounts ever posted) and the concentration split
(top 1% of accounts: 74.7% of posts; next 9%: 24.0%; remaining
90%: 1.3%) — is measured jointly on a single population, and the
pattern replicates across all four networks. Pew's sample, by
contrast, comprises 2,791 U.S. adult users who consented to share
their handles, reports a top-decile share (80%) without measuring
the never-posting share of registered accounts, and counts
retweets and quote tweets as posts. For a distribution over all
accounts held in a node store, the census that measures the zero
class directly is the stronger source. We set the never-posting
share to 85%, inside van Mierlo's measured bound; all other
authorship figures follow from his split, so the top-10% share
(98.7%) is a consequence of the adopted distribution, not a
separate target.
The one honest caveat (one clause in the paper, as already planned):
van Mierlo's networks are moderated health communities — this limits
which platforms the numbers describe, not how they were measured.
6. Other quantities — unchanged, one source each
Followers / following: Kwak et al. / Ugander et al., as in the
  plan. Mean(followers) = mean(following) in the closed graph.
Likes, comments, impressions per post: McGrady et al. (2023), as
  in the plan (median likes 0, mean ≈16; comments ≈ likes × 0.3;
  impressions median ~50, top ~3.7% ≈ 93%, max ~1M on the viral post).
Total impressions: ~150M events, set by the node's attention
  budget under conservation — subject to §7's feasibility check.
Node ads: ~300, declared (fills the base fixture's zero).
7. Feasibility checks before generation (workspace's action item)
The workspace flagged it will verify impressions/attention-budget
feasibility before generation rather than silently relaxing a
target. Confirmed — and the same rule applies to any further
incompatibility found between quantities (e.g. per-post engagement
means vs. the total attention budget, or mismatched time horizons):
Run the consistency/conservation arithmetic up front and report any
  conflict before generating.
Resolution rule: the source governing a quantity keeps its
  distribution; totals and time horizons are what adjust, and any
  adjustment is declared in the stats receipt and the paper — never
  silent.
Conservation identities must close: likes given = likes received;
  comments given = comments received; summed impressions = event rows;
  reach ≤ impressions and ≤ the eligible audience.
8. Validation gates (all before the pilot)
Marginals: §4 authorship contract; §6 per-post distributions;
   ~150M events (or the §7-adjusted declared total); ~300 ads.
Joint realism: activity/popularity/followers/impressions
   correlations present and correctly directed; no dormant-account
   viral anomalies except deliberately modelled cases.
Referential integrity: all group links, reactions, comments,
   and deliveries resolve; no impossible timestamps.
Workload validity: for every K / hot / dispersed cell, report
   the distribution of active followed authors, candidate posts, and
   non-empty feeds per reader. A demographically realistic dataset
   whose measured feeds have silently become empty is a setup failure.
Small floors first: the generator + oracle must pass at small
   scales (10k / 100k) before the 1M build — the #1417 lesson.
Statistics receipt: machine-generated from the finished store
   (total / mean / median / p99 / max / top-1% share per quantity, plus
   store totals). The paper's dataset table is transcribed from this
   receipt. A dataset that misses its contract is a setup failure,
   never data.
9. Substrate and sequencing (unchanged from the amended plan)
Uniform droplet SKU across D1–D5 and Phase 2 (candidate on record:
  8 vCPU / 32 GiB at $0.25/h — **catalogue only; provisioning
  eligibility must be verified at pilot time**). Envelope: 32 GiB
  droplet / 28 GiB container cap / 22 GiB ClickHouse limit / 4 GiB
  OS+API, frozen at the pilot.
Generate once → upload to S3/MinIO → every trial imports the same
  frozen files. Baseline (Arm A) and treated cells under identical
  resources.
Pilot = one Study B 1M cell (3 trials) end-to-end on a droplet;
  report the pilot result before the full fan-out. Clean pilot trials
  count toward the study.
The 5 GiB sensitivity cell stays as planned (envelope comparison on
  the same realism store).
No paid provisioning until §8 passes and the operator has seen
  the statistics receipt.
10. What does not change
The study programme (Phase 0, B, C, A, P, X, gate15, views re-check,
  Phase 2), gate order, and success criteria from the ratified plan.
Freeze discipline: parameters freeze at the pilot; a later change
  restarts the affected rerun.
The paper cites the rerun series only; base-series results remain
  development history, never pooled.
The dataset release (web10-social-1m) ships the generator +
  parameters + citations + validator, not the rows.
Production migration (§8 of the experiment plan) remains a separate,
  explicit operator decision after the evidence. **No CMT submission
  without the operator's explicit go-ahead.**
Internal freeze Nov 20, 2026; submission deadline Nov 24, 2026,
  11:59pm AoE.
```

## Later operator approval — preparation host and artifact storage

After the passing 10k/100k floors and scratch audit were presented, the operator
asked to use DigitalOcean for the larger storage, then authorized monitored
execution (“we have alot of credit, lets do it in a way we can monitor it”).
This permits one 8-vCPU/32-GiB/400-GB preparation host under the proposed
four-hour/$5 target, not the study fleet. The operator separately chose private
MinIO staging and confirmed existing web10 storage, then requested generated
artifact cleanup. [REALISM-CLOUD-PREP.md](REALISM-CLOUD-PREP.md) records exact
scope, original deadline, setup failures, monitoring locations and remaining
gates. This supersedes a local-only preparation constraint, not the source,
validation, private-storage or explicit production/submission requirements.

## Feasibility consequences to calculate before generation

**Later storage authority:** [REALISM-STORAGE.md](REALISM-STORAGE.md) preserves
the operator's two-copy decision: private Spaces in the droplet region for the
rerun, canonical MinIO alongside V2 under the realism identity, verified
manifest/file digests on both; public posting only after freeze and statistics
review, from MinIO. Earlier MinIO-only staging text is superseded, not a claim
that either transfer has already happened.

These are **necessary-bound calculations, not generated statistics or an
approved replacement total**. Use the nominal contract here; actual finite-size
rounding, tolerances and the chosen store horizon must be explicit in the
executable contract and receipt, not exploited to change the model silently.

For `N` total accounts and 85% nonposting, the posting part of the bottom
90% contains `0.05 N` accounts. Each needs at least one original post. If
that band contributes 1.3% of `P` total original posts:

`P >= 0.05 N / 0.013 ≈ 3.846 N`.

At `N = 1M`, that is at least about 3.85M original posts, before profiles,
reactions, comments, links or deliveries. This is not the old one-post-per-
creator input. At mean ~16 likes/post and comments/likes ~0.3, the corresponding
order-of-magnitude lower totals are ~61.5M likes and ~18.5M comments. Count
each from finished records and reconcile giving and receiving accounts.

For impression median `m = 50` and a top-3.7% share of 93%, at least
`(0.5 - 0.037) P` posts outside that head each need at least 50 impressions.
The outside-head 7% of total impressions `I` must accommodate them:

`I >= (0.5 - 0.037) P * 50 / 0.07 ≈ 330.714 P`.

Combined with the nominal authorship bound, this is roughly **1.27 billion
impressions at 1M accounts**, not 150M. The floor scales imply roughly 12.7M
and 127M event rows at 10k and 100k accounts respectively, before additional
joint-model constraints. At the old attention rate (150M per 30 days), the
nominal lower-bound horizon is about 254 days. These are lower bounds, not a
claim that this exact store/horizon is sufficient or that all data fits cache.

Apply directive §7: retain the governing distributions, explicitly adjust
totals/time horizons, and recompute the attention budget, timestamp span,
repeat-delivery/unique-reach constraints, resource needs and store-size estimate
together before generation. A larger justified total must not quietly become
an envelope increase: the 28/22 GiB limits stand, and any infeasible resource
case is reported before a build or paid pilot. The old “single-digit-GB store”
and runtime estimates in the November 10 plan are hypotheses to recheck, not
admission evidence.

## Durable work queue

The actionable bites and ownership live in the `sigmod-paper` lane of
[`parallel-execution.md`](../../../knowledge-base/strategy/parallel-execution.md)
and the SIGMOD section of
[`plan.md`](../../../knowledge-base/strategy/plan.md). Implementations, floor
receipts, the 1M build, review and paid-pilot authorization remain open until
their own evidence exists. This record completes decision capture only.
