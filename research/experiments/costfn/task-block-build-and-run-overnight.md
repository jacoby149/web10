# Sustained DAU: build and run overnight

Start from merged #1713. Finish and merge one green runner source PR before
provisioning. Admit one `c-32` host under the fresh $25 compute cap. Verify
32 guest-visible logical CPUs and the host's memory, and retain ClickHouse's
28 GiB container / 22 GiB server limits. The 24-hour owned-host poweroff
failsafe supersedes the original DAU packet's 12-hour value for this task;
it is not a deadline or a guarantee that billing stops. Supervise every 600
seconds and record source repairs, re-entry decisions, and completed stages.

The immutable inputs are snapshot `255003176`, its verified Parquet lineage,
and the frozen population and authority. Do not alter them or add grants.
Contracted fixture setup, write traffic, and delivery events apply to the
owned run copy only. Reuse validated preparation after a repair. Do not
weaken exact parity, switch to fallback reads, change an offered rate or upsize.

## Source acceptance before native work

- Dispatch the full [contract](DAU-SUSTAINED-LOAD.md) open-loop schedule without
  waiting on a response to offer the next arrival. Preserve phase boundaries,
  count rejections and late offers, and let live native work finish or reach
  its own bound after a drain verdict.
- Certify every selected reader/scope on the actual indexed serving path,
  with live read authorization. Build the needed per-reader furniture from
  frozen inputs. The legacy single-reader identity/parts fences cannot be
  bypassed or replaced with an unrestricted generation exception.
- Admit actual authorized creates from the existing writer pool, using the
  native publication journal to reconcile commits, target edges and index
  maintenance. The frozen input has read-only browser app contracts; use the
  existing direct-API writer’s normal token and group authorization, not a
  new grant. Prove the journal’s committed target groups are outside the
  selected Following groups before relying on invariant pages. Preserve
  concurrent delivery history and verify views against independent delivery
  expectations; never treat a returned or serving-side aggregate as its oracle.
- Bank separate ClickHouse and API cgroup samples, API process memory, and
  host file cache and OS/other usage. Retain raw counters and avoid adding
  process RSS or cgroup cache to host occupied memory a second time.

## Native acceptance

Verify the ingested Parquet counts and census 150 eligible readers before
measurements. Use the contract's steady state, calibration, warm-up, peak,
average and drain with 1 post/s during the sustained phases. A parity
divergence withholds comparison figures. Name any contract resource stop
and preserve its curve. Verify private evidence by SHA-256 off-host before
owned cleanup; retain the original snapshot. Only a banked sustained result
updates draft v8. The final receipt and summary must distinguish achieved
rates, debt slopes, drain, whole-node memory, parity, and estimated compute.

The source now has a quiescent reader-oracle batch, an HTTP workload adapter,
an open-loop phase driver, exact comparison and memory accounting. The
previously unordered reaction and comment aggregates are explicitly ordered by
their existing group key on both oracle and request paths; the first-page and
views requests are unchanged. This remains source control, not an enabled runner
or a native receipt. The certified mixed-load cell and native reconciliation
are still required before opening the timed entry point.

The preparation code can build the exact tally scopes per reader and verify
their roots against canonical counts. The post-run audit can match complete
publication intents to their acknowledgment and current canonical attachments,
and derive views from raw delivery bookends when the interval is proven
append-only with no relevant TTL expiry or change in the raw counts. Equal
bookends without that proof are not parity. If delivery state changes during
the measured interval, a per-request native visibility replay is required.
The opt-in mixed-load Compose entry now binds the frozen scope certificates
and the 100 existing writers to the owned host/task. Its only write route is
the node's existing `/v3/create`: exact targets and deterministic slot identity
are checked before the normal authorization and journal, with canonical reads
for the write/reconcile path. Indexed reads still use live authorization and
the original frozen-copy, tally and pin fences. Never start timed traffic from
an unverified bundle. The controller now accepts the same-host composition
proof and frozen reader census, builds the mixed-cell bundle, and connects
calibration, open-loop HTTP, native publication and stable-delivery audits, and
private resource receipts. The direct read-only class storage calibration is
separate from actual virtual-device I/O during load. Source checks do not prove
the fresh restore/fixture/furniture chain or an admitted-guest boot, and the
controller never claims custody or publishable native capacity by itself.

The no-new-grants fence applies during preparation as well. `--prepare-only`
requires a validated retained paired fixture already present on the owned
restore; it never invokes the fallback that adds consent and creates new group
memberships. The plain frozen Parquet import carries no such fixture. Provide
a verified transfer of the existing snapshot fixture and its native authority
before provisioning a run that depends on this stage. A missing fixture is a
setup blocker, not a native resource or parity stop.
