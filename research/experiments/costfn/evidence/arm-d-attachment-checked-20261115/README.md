# Repaired Arm D: native timeout and broad-read stop

**15 November2026 — operator: “run the experiment please!”**

The separate attachment-checked query ran on the existing settled realism copy.
Its excluded warm-up failed at the unchanged ten-second ceiling:

| Native observation | Value |
|---|---:|
| Query ID | `arm-d-repaired-dc14428c0c76473985c696043757bdc1` |
| Rows read | **345,725,896** |
| Logical bytes read | **33,545,329,245** |
| Native elapsed | **10,002ms** |
| Native exception | **159 — timeout** |
| Tracked query peak memory | 371,057,510 bytes |
| Returned page / exact parity | **Not established: no page returned** |
| Measured trials | **0 — stopped at warm-up** |
| K1000 / full sequence | **Not run** |

**Verdict: NATIVE_FAILURE_STOP, with MAIN_EXCEEDS_10M_ROWS.** This is not an
INVALID returned page or a successful timing sample. The query restores the
canonical attachment/history/policy checks, but the actual native main again
performs broad resolution scans. Do not weaken those checks to recover the
old shortcut's timings. No additional treatment or cell ran after this stop.

## Scope and source binding

* Same immutable dataset `2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`.
* Same reader index1, `rd42-u0980001`:20 followed groups plus self, LIMIT21.
* Same isolated DO host619371600 and own `documents_d`, without rebuilding,
  replacing, renaming or consolidating any table in this attempt.
* ClickHouse24.8.14.39;32GiB host/28GiB container/22GiB server and query cap.
  The driver explicitly uses four threads. Main SQL stays at10 seconds;
  setup/fingerprint statements have a separate bounded120-second allowance.
* All four tables retain one active `all` part; current counts/marks equal the
  preserved settled census, with no active merges at admission. Original table
  UUIDs/sort keys match before and after the successful setup retry.
* Fresh original-document and original-link count/sum/xor fingerprints match
  the previous Arm T consolidation receipt; the new copy's all-column multiset
  fingerprint also matches original documents. These are diagnostic fingerprints,
  **not exact row-equality or adversarial mutation proof**.
* Reuse the prior independent canonical oracle and complete synthetic group-author
  census under that fixed immutable-store condition. Every followed group still
  has one author (sum20), plus one self author separately; full inventory and
  source/receipt hashes are in the raw result.

This is explicitly a **fixed-inventory native-main diagnostic**. It does not
measure runtime author enumeration, HTTP authentication/discovery/preparation,
delivery or follow-ups; it cannot establish the complete main-request budget,
p95 or shared-group generality. Main SQL alone already fails, so there is no
Phase-0 success to promote regardless of that excluded additional work.

The exact generated repaired SQL SHA-256 is
`df59b26f3ad8bfc968210a77249aee412e61abebda6b385e81c072fc45bbd335`.
It is the additive constructor, not the old author-to-group CASE treatment.
The executed text additionally appends JSON output format; its separate SQL
hash and exact native query ID are recorded in the step receipt.

## Preserved setup interruption, then one bounded retry

The first setup begins around05:07:33UTC. The pre-existing
`arm-t-owned-containers-stop` one-shot timer fires at05:07:52UTC during the
original-link fingerprint. ClickHouse reports **394 QUERY_WAS_CANCELLED**,
then the final identity read reports connection refusal. Docker records a
SIGTERM exit143 and OOMKilled=false. No repaired main is attempted in that
setup; it is not a feed timeout or a failed parity sample.

Retain that complete failed result and executing driver at the top level.
`setup-stop-cause.json` preserves the exact systemd journal evidence. The old
timer is neither disabled nor rewritten. One retry uses a fresh output/driver
identity and an additional independent container-stop timer at05:14:51UTC,
with its driver runtime bounded to05:14:00UTC. Original hard poweroff05:17:21UTC,
provider cleanup05:17:51UTC and total budget remain unchanged. No new host.

The retry completes setup, reaches the main timeout/anomaly above, and stops
its containers with service exit0 at **05:10:27.654244UTC**. Exit0 means the
supervisor recorded the negative result and stopped cleanly, not that the query
or parity gate passed. All **62** pre-existing baseline/Arm T/base-Arm-D evidence
files match their pre-run SHA-256 inventory. No third attempt is authorized.

## Receipt map

* `arm-d-attachment-checked/result.json`: interrupted setup, zero main attempts.
* `run-arm-d-repaired.py`: its exact executing driver.
* `setup-stop-cause.json`: independent host timer/cancellation evidence.
* `retry/arm-d-attachment-checked-r1/result.json`: successful admission checks,
  native failed warm-up, fingerprints, inventory, source/query/receipt hashes.
* `retry/arm-d-attachment-checked-r1/treated.sql`: exact repaired native source.
* `retry/run-arm-d-repaired-r1.py`: executing retry driver.
* Both `preservation-and-cleanup.json` files: protected-evidence hashes and
  container/service state. They do not claim provider deletion before its deadline.

The prior baseline, Arm T and invalid Arm D comparison remains in
`../arm-d-realism-20261115/README.md`. This new repaired-query observation is
separate:345.726M rows/33.545GB/native159, no returned parity page. Preparation
and reaction-follow-up failures remain separate, untreated blockers.
