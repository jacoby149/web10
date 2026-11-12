# Preparation workflow repair — 12 November 2026

## Stop treating a session as the controller

The earlier preparation host was deleted. The last collected live snapshot is
03:57 UTC at exposure partition 68/1024. Deletion was verified at 10:02:47 UTC,
after the approved 08:01:22 deadline. There is no collected final validation
receipt, verified private dataset copy or matching droplet snapshot. The last
collected failed receipt belongs to an earlier validator attempt; it cannot
establish the final attempt's outcome. Treat the recorded full input as lost.

The local-Mac watchdog outlived the coding session but not workstation/network
loss. More log lines would not have preserved the dataset. The old lease is
closed, and no new paid host or public upload is started by this repair.

## One correctly sized physical partition pass

`realism_validate.partition_count` sizes from actual physical row volume with
25% average headroom: 16M events plan 64 buckets, 160M plan 128, 1.6B plan 1024.
An exact complete-key histogram must admit the maximum bucket before any file
is written. Skew causes replanning up to a bounded 4096 buckets, then refusal;
an indivisible hot key is never split to make a window check pass.

The physical COPY groups destination buckets with an engine-bounded external
sort, then uses 16 open files and an 8192-row flush threshold. This avoids both
the oversized-bucket Parquet rewrite and writer eviction churn. Memory/thread
limits are unchanged; writer settings are restored even if COPY fails. Every
written bucket must match its exact admitted count. The validator still checks
all actual rows, fields, multiplicities, complete keys and semantic invariants.

The rejected interleaved-write prototype created 246,826 tiny files for 2M
records and took 118.82 seconds. It is not shipped. Grouped writes produce 1024
files for the same probe. External sorting can spill; 1.6B sorting scratch and
cloud throughput remain unmeasured, not assumed from these local results.

## Local evidence, not a cloud-speed promise

Pinned baseline validator SHA-256:
`7e5c17cd4af7c893460a5d6123e29fbfea77811ff61f9cfced3ce6787d004760`
(source at commit `ded8df2facc22ab8972566e28e68db93a24bf407`).
Candidate validator SHA-256:
`372a57fdd1547cc62d3cb2afd61f738694bea67ccd8a996ffadb48d06ac31ed1`.

`realism_partition_probe.py` uses 2M synthetic physical records, 1024 resulting
buckets, one thread and the same 2 GB DuckDB limit on local ARM64/DuckDB 1.4.2.
Three alternating paired subprocess runs:

| Measure | Previous two-pass path | Planned grouped path |
|---|---:|---:|
| Elapsed trials (seconds) | 3.879 / 3.205 / 3.499 | 2.463 / 1.907 / 1.823 |
| Median seconds | 3.499 | 1.907 |
| Temporary Parquet bytes | 81,547,053 | 51,631,236 |
| Temporary Parquet files | 1,088 | 1,024 |
| Largest bucket rows | 2,140 | 2,120 |
| Highest process RSS across trials | 406,781,952 | 427,573,248 |

The candidate's median is approximately 45% lower on this small probe, with
slightly higher RSS. This is not a full-validator speedup or a 1M/DO result.
A separate candidate probe at a 128 MB engine setting passes in 2.232 seconds,
with 321,863,680-byte process RSS; engine limits are not RSS caps.

Exact-control tests cover all-column multisets, duplicate-key co-location,
schema, count/bucket bounds, skew refusal, empty input, settings restoration and
injected COPY failure. A current-contract fresh local 10k dataset with 16M
deliveries passes **all 50 independent checks**, dataset
`6c7c91e75ec4f50391898b73c3558da010f98882ebbfdd1e76a488512802c73b`.
The old local 10k receipt first refuses a stale executable contract; that refusal
is preserved instead of loosening contract equality. No 100k/1M rebuild occurs.

Probe invocation (use fresh output directories):

```sh
.context/realism-venv/bin/python research/experiments/costfn/realism_partition_probe.py .context/partition-candidate
# Extract the pinned baseline source into private scratch, then pass its hash:
git show ded8df2facc22ab8972566e28e68db93a24bf407:research/experiments/costfn/realism_validate.py > .context/partition-baseline.py
.context/realism-venv/bin/python research/experiments/costfn/realism_partition_probe.py .context/partition-baseline-run --baseline .context/partition-baseline.py --baseline-sha 7e5c17cd4af7c893460a5d6123e29fbfea77811ff61f9cfced3ce6787d004760
```

## Restart gate, not a fabricated recovery system

`realism_cloud_lease.admits_creation` now fails closed without a recent,
account/run-bound `workflow_readiness_receipt`. `realism_readiness.py` checks
the bounded receipt's metadata, exact archive-probe size/SHA readback, private
independent unvalidated quarantine, controller survival of session/workstation
loss, final-receipt recovery, readback after host loss, archive-before-validation
and cleanup, failed-archive refusal and retained hard cleanup. Closed leases
still cannot reopen. Cleanup does not wait indefinitely for this gate.

This code does **not** perform the external drill, provision a remote controller,
upload artifacts, or cryptographically attest the receipt. The operator-owned
receipt must come from the actual connected drill, not hand-entered success
flags. No passing operational receipt exists yet. The test receipts are explicit
offline fixtures, not readiness evidence.

Before another paid run: implement/test the independent controller and bounded
private quarantine preservation; demonstrate session/workstation/network loss,
failed archive, final receipt retrieval and recovery after host deletion. Confirm
storage access and exact readback, then obtain new bounded spending approval.
Parallel validation and source/input-bound interruption checkpoints remain open.
Canonical validated Spaces/MinIO copies, statistics review, connected node/parity
and the bounded pilot still gate experiments. Nothing here claims they passed.
