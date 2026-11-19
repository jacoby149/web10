# Tally wiring: ordinary count-stage PASS; paired precheck OPEN

**The ordinary uniform K20 response passes exact parity, and displayed counts
now come from `counting_numbers_tally`, not document-count resolution.** Pure
count lookups are thousands of rows. The optional projection cell completes too.
However, the final domain audit finds a paired-page precheck omission, so **full
tally acceptance is OPEN**, not PASS. Both complete responses still fail500ms/
25MB. Their named remainders and the verifier defect are separate facts.

[results.json](results.json) contains build/verification/source/cleanup receipts.
[native-query-costs.csv](native-query-costs.csv) reconciles260 captured read
statements and51 additional exact request-tagged records across four complete
sequences. Raw SQL, canonical/stored verification maps and response/oracle data
remain in the verified private archive.

## Coverage defect: recorded PASS flags are not the missing paired check

The source verifier selected `profile.reference_page` targets, but that legacy
page is not the canonical paired document-stream page. In all five paired
service/label checks, the recorded81-target domain omits **all20 actual paired
root IDs**. The oracle values there are zero/empty and `get(...,0)` comparisons
did not detect that the stored-value query never requested those actual roots.
The ten recorded-domain comparisons really agree, but five are not evidence for
the paired roots required by the admission. Raw programme/build PASS flags are
preserved unchanged; the independent audit overrides the acceptance claim.

All21 ordinary roots are inside each ordinary verification domain. Those five
checks and the deterministic60-root sample remain valid, as do the ordinary
measured response/oracle replays and count-stage costs. Unknown-kind0/0 reaction
groups retain their presence row. No ordinary numerical result is discarded or
promoted into proof of the untested paired targets.

The source repair unions the independent oracle's actual IDs/prepared-row IDs
into the target domain and explicitly refuses a page comparison whose verified
domain omits a required root—even when every expected count is zero. A regression
replays the wrong-legacy-page/zero-count failure. This repair has no new native
acceptance: cleanup preceded the audit and **no fresh paid/native retry is
authorized** by the consumed lease. A new admission is required to close the
paired gate; it must not be silently waived or postdated into the old run.

The separate banked fat document/link fixture verifies exactly50,000 comments,
13,462 root-wide reactions,6,731 direct post reactions and the entire6,731 finer
reaction-target map. Root-wide and direct-post counter kinds are distinct, so
the pinned feed's meaning is unchanged. Every expected/stored target/kind/value
pair agrees. This reconstructs canonical verification data only: **no Stage D
timing, view events or aggregate seed**.

### Main count-only diagnostics

These are three real standalone table lookups extracted from the actual new
main statement. Each native SQL reads only `counting_numbers_tally`. They are
diagnostic, non-additive and not subtracted from the mixed main query.

| Main count component | Banked document rows | Banked document bytes | Tally rows | Tally bytes | Tally native ms |
|---|---:|---:|---:|---:|---:|
| Reactions, like/dislike |91,897,589|7,097,470,372|1,600|107,200|12|
| Reposts |176,400,726|7,778,559,804|1,600|107,200|19|
| Comments |247,081,302|17,060,447,628|1,600|107,200|14|

All return the independently expected zero groups for this ordinary Following
page. Positive/finer-target correctness is established by the fat and store
sample checks, not inferred from these zero groups.

### Actual count-bearing request stages

| Measured stage | PR#1590 projection | Tally projection | PR#1590 uniform | Tally uniform |
|---|---:|---:|---:|---:|
| Mixed main rows |260,210,421|234,176|163,304,033|234,176|
| Mixed main bytes |21,310,993,131|18,718,115|12,610,659,119|18,666,189|
| Two follow-up count rows |382,967,541|2,688|299,471,457|2,688|
| Two follow-up count bytes |37,945,364,162|353,839|29,376,882,876|353,839|

The mixed statement still performs canonical post/profile/policy resolution.
Its234,176 rows are **not** claimed to be pure tally reads. The independent
1,600-row table diagnostics expose the count-only work without inventing an
exact per-table split. Follow-up statements are directly document-free scalar
lookups. All values match the same response oracle.

## Completed responses and the remainders

Captured-query accounting matches the PR#1590 banked comparison scope. There is
one warmup and one measured complete sequence per cell, not p95 or capacity.

| Measured complete response | Banked document-count composition | Tally composition |
|---|---:|---:|
| Uniform HTTP ms |156,892.952|128,480.771|
| Uniform actual rows |553,857,605|91,319,007|
| Uniform logical bytes |52,097,155,602|10,128,634,167|
| Optional projection HTTP ms |25,815.782|7,647.980|
| Optional projection actual rows |646,223,530|3,282,460|
| Optional projection logical bytes |59,461,806,191|224,523,076|
| Exact response parity |PASS|PASS|
| Complete500ms/25MB |FAIL|FAIL|

The untreated26.x baseline remains **banked**,4,551.675ms/222,387,685 bytes,
parity PASS/budget FAIL. No baseline is rerun. Neither these observations nor
the optional colour are a CPU-controlled latency speedup claim: the operator
explicitly approved an AMD→Intel/disk substitution described below.

| Named measured remainder | Tally uniform bytes | Tally projection bytes |
|---|---:|---:|
| Raw views |98,624,346|98,624,346|
| Unclassified |52,096,217|52,096,217|
| Preparation |9,948,718,460|44,557,359|
| Candidates |10,167,477|10,167,477|

There is no Stage B substitution or arithmetic virtual aggregate total. The
unchanged uniform node-ad preparation statement remains
`4bc916c85c420f45a56d98424274efe1f83483092363c8c9fdae1194c24765f6`.
Its native actuals are retained separately in JSON. No preparation bounding or
unclassified optimization is included in this treatment.

Exact request tags also recover auxiliary logger/insert-driver metadata outside
the captured query ledger. JSON retains each sequence's auxiliary and inclusive
totals; CSV labels those records `request_tagged_auxiliary`. They are additional
request-correlated work, not adjustments invented for historical baselines or
extra wall time to add to the HTTP observation.

## Build, verification and authority

- Generic schema: `(doc_id String,counter_name String,scope_key String,value UInt64)`,
  `(doc_id,counter_name,scope_key)` order and64-row granularity; one sorted final
  part. There are **4,531,029 final rows** across the requested scopes, not an
  all-reader capacity claim or a page-pinned cache.
- Canonical source is the migrated `engagement_documents` store on the frozen
  dataset. Canonical policy generation, copy-part hash, constructor hash and
  actual tally-part hash are bound in the receipt. Current service/group/reader
  authorization and recipe identity remain first, with both source-copy and
  tally fences before scalar dispatch. Counter kinds, not table columns, carry
  direct/root/finer semantics (D60/D114).
- New tally setup **including verification** takes3,374.205s. Native setup writes
  26,979,927 partial rows and4,531,029 consolidated rows. Those are separate
  physical setup counters, not rows in the served response, a live-write
  benchmark or full merge/storage amplification. The JSON also reports summed
  native build durations, which are not setup wall time.
- The existing PR#1590 infrastructure composition is reconstructed as setup,
  including its one pre-projection ordinary K20 legacy scope build. Those legacy
  values do not supply this treatment's counts. New tallies are built from the
  migrated canonical store; no baseline/B/D performance measurement is repeated.
- All four new main SQLs match actual native prefixes. Their non-count CTEs,
  fields, filters, order, limit, QUALIFY and profile join compare exactly to
  PR#1590's corresponding actual statements. Only the three aggregate joins are
  scalar-table reads. All eight follow-ups read only the tally table. Document
  retrieval on open retains the existing projection path.
- Independent offline response/oracle replays pass for both phases in both
  cells. Native read counters/stages/SQL digests reconcile without a row stop.
  Captured read statements retain native600s settings; auxiliary INSERT settings
  are not covered by that read-query assertion. Zero-valued row-limit defaults
  absent from the changed-settings map are not fabricated into the evidence.

## One lease, explicitly substituted hardware, owned cleanup

The AMD catalog preflight fails **before resource creation**. The old SKU lacks
regions metadata/is absent fromnyc3; retained snapshot255003176 isnyc3-only.
Jacob explicitly approves `s-8vcpu-32gb-640gb-intel`:8vCPU/32GiB/640GiB at
$0.28571/hour, retaining32/28/22GiB and the four-hour/$2 bound. This is not the
historical AMD CPU/disk, and it is not silently presented as identical hardware.

DO620898285 binds **19 November02:03:43→06:03:43UTC**. Two readiness timeouts
continue on that same host, no replacement or extension. Source`c7c0012f5`
verifies1,444 files/16 approved pins;11 tally controls pass on-host. Agent~300s
and droplet self-kill timers only, no guardian.

Final checkpoint8,468,952 bytes/SHA
`dc9d4785a740d85e6a855cb9040c9717cc79ec4f1f9ee10c9a07accef70929e2`
and stopped-native archive6,947,501 bytes/SHA
`8af6caff3a93d0cf7013b58a54aa57da1f7da3df7dcaa8bd739c95203b1e88ad`
verify off-host before owned cleanup. There is no OOM or engine restart after
final collection. Owned droplet/firewall/key absence verifies **04:13:42.115UTC**,
before06:03:43. Compute estimate **$0.618968**, not invoice; retained storage is
separate. Temporary key/cloud-init secret files are removed. The retained
snapshot/volume and production are untouched.

**Conclusion:** ordinary count-stage collapse and exact ordinary response parity
are measured; the complete required tally acceptance is **OPEN on paired-domain
coverage**. The repaired verifier is source/no-engine proof only. Original
Config F/PR#1590 FAILs remain banked; new complete responses are also budget
FAILs. No live maintenance/invalidation, production protocol surface, counter
retirement,§8 work, views wiring, preparation repair or fresh paid execution
follows automatically from these qualified results.
