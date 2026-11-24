# Indexed K20 baseline samples banked; original wrapper STOP preserved

**The original indexed F-stream K20 requests ran and both 21-row complete
responses passed the independent oracle.** The measured sequence used
**9,063,374 captured rows, 627,581,412 captured logical bytes and 9,187.433 ms
end to end**. The original wrapper nevertheless recorded `STOP`: its receipt
adapter expected the paired-P path, not the uniform-K20 F path. A separate
offline replay against the exact archived packets reconciles both samples
after correcting the shared path declaration. No native statement was rerun
and the stopped runtime record was not changed.

## Native complete-response samples

| Sample | Captured queries | Rows read | Logical bytes | Summed native duration (ms) | Largest statement memory (B) | Complete HTTP wall time (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Warmup | 75 | 24,658,034 | 1,369,461,140 | 3,880 | 98,456,675 | 11,715.753 |
| Measured | 75 | 9,063,374 | 627,581,412 | 1,896 | 76,630,539 | 9,187.433 |

Request-tagged auxiliary work is separate: warmup 15 queries, 151 rows,
15,812 bytes, 310 ms summed native duration, 4,256,972 B largest statement
memory; measured 12 queries, 60 rows, 6,840 bytes, 197 ms and 4,261,204 B.
Summed duration is not CPU time; peak individual statement memory is not
request-wide RSS. These are two samples in order on the repaired slice, not a
latency distribution, the full-store indexed result, a physical-disk measurement,
or any challenger outcome. The measured latency exceeds the 500 ms target.

### Measured sample by captured stage

| Observer stage | Queries | Rows read | Logical bytes | Summed native duration (ms) | Largest statement memory (B) |
| --- | ---: | ---: | ---: | ---: | ---: |
| candidates | 17 | 83,713 | 9,896,411 | 304 | 6,581,059 |
| counts | 2 | 2,816 | 370,748 | 85 | 5,084,496 |
| counts embedded in resolution | 1 | 3,177,268 | 245,042,478 | 276 | 18,268,937 |
| generation or envelope | 24 | 616 | 41,476 | 152 | 4,477,459 |
| metadata identities | 1 | 64 | 5,440 | 10 | 4,408,592 |
| pin index lookup | 1 | 25 | 2,275 | 11 | 4,800,843 |
| pin materialization | 1 | 331 | 51,928 | 21 | 5,622,434 |
| preparation | 15 | 4,650,088 | 306,533,868 | 410 | 9,364,630 |
| unclassified | 11 | 974,848 | 51,237,185 | 144 | 4,642,708 |
| views (observer label) | 2 | 173,605 | 14,399,603 | 483 | 76,630,539 |

The original parsed inventory replay classified 1,722 of the observer's
views bytes as `delivery_dedup_raw_read`; it preserved the 627,581,412-byte
total. The two biggest captured stages, preparation and counts embedded in
resolution, accounted for 551,576,346 logical bytes. These are the places to
inspect when implementing projection, not a prediction of removable I/O.

## Binding, gates and STOP lineage

- Executing merged source [#1629](https://github.com/jacoby149/web10/pull/1629),
  `19a7955a9a32c5b579fb85883bad3718f88dd6d3`. One owned DigitalOcean `nyc3`
  droplet `622796186`, `s-8vcpu-32gb-amd`, ClickHouse `26.10.4.207`, 32/28/22 GiB.
  Original window on 24 November: `03:22:23`–`07:22:23 UTC`.
- Slice/source oracle, migration, billboard fixtures, tally fingerprint refresh,
  both aggregate grains and all four composition gates passed. The day seed
  reconciled exactly 897,139,143 events. No projected canonical, hybrid or fault
  suite ran.
- The baseline adapter refused the F-stream path after the unchanged original
  composition runner saved both parity-PASS samples. The source fix shares
  `CELL_SERVING_MODES` between composition and the receipt adapter; paired-P and
  fallback still cannot pass the uniform-K20 audit, and no serving mode changes.
- The corrected offline audit used the original SQL files, request traces,
  native receipts and per-phase response flags. It verified all 150 captured SQL
  hashes and unique native IDs, their request tags and matching native metrics,
  keeping auxiliary receipts separate. It only audits the stored samples; it
  neither rewrites the original `STOP` nor issues a new runtime verdict.

## Custody and cleanup

Both archives verified off-host before deletion and are retained privately.
Owned droplet, firewall and SSH key absence verified `07:16:35.612278 UTC`;
tag removed and snapshot `255003176` retained. Estimated compute **$0.975876**,
not invoice. No second lease or further workload followed.

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| State and receipts | 12,513,597 | `de7c8290448c4585457946bb8c509a19e40b808b98fdd48459e85e368863584d` |
| Stopped ClickHouse query-log parts | 23,422,935 | `c407cfcfb34fe508634d03cb0d4d667b0953f4678a3151f252a6c64df699cd77` |
