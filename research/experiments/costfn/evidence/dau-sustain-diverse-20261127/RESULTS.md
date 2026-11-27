# Diverse-reader sustained DAU: calibration resource stop

**`CALIBRATION_RESOURCE_STOP` — the single-worker indexed API could not clear
the calibration backlog.** The observed bottleneck was API execution on one
Python core, with SQL parsing and rendering prominent in the profile. This is
not proof that it was the only bottleneck, that the c-32 hardware was fully
saturated, or that the c-32 could not hold the restored store.

Warm-up, measured peak (15 reads/s), measured average (2.9 reads/s), the
measured writer stream and the contracted final drain were **NOT RUN**.
Measured per-reader parity and physical storage headroom were **NOT
ESTABLISHED**. No sustained capacity comparison, product p95, production
claim, or amendment to draft v8 follows. This is a supervised calibration
stop, not the measured-window 60-second saturation verdict.

## Verified preparation

- One DigitalOcean `c-32`, droplet `623860307`, `nyc1`. The guest exposed
  **32 logical CPUs and 62.79 GiB usable RAM**; no physical topology is
  inferred. ClickHouse `26.10.4.207`, container cap 28 GiB, server cap 22 GiB.
  The 24-hour failsafe was armed and verified on the guest.
- Snapshot `255003176` remained intact in `nyc3` and was made available in
  `nyc1`; both regions verified at cleanup. The frozen Parquet import
  reconciled **1,000,000 users, 88,200,300 documents, 92,200,600 document-group
  links and 1,600,000,000 events** before applying the retained fixture.
- The native census found **20,000 eligible principals**. It froze **150**
  distinct readers, each using their own Following scope; no grant or
  membership was created to qualify them. Census SHA-256:
  `01dd0aeb1f548ca94d3f74cb3e03076e805bf5d6a6e2c3cf70ba161fd4e134e7`.
  Selection SHA-256:
  `a538ead12ca9f53c7977f613fc116a8197689f7676c6a90ff7af34cc78fda82f`.
- The byte-verified retained fixture transferred 63 documents, 93 links,
  three group contracts, 2,006 member rows and two already-existing
  fixture-origin app contracts. Exact native comparisons passed in both
  directions for all five tables; no fixture was recreated or consent added.
  Transfer manifest SHA-256:
  `9e2b9aedad33dd2d7fbc28bc89a846893ed246c4d0d75971f086c0c0d91ded11`.
- Steady state, all 2,660 group membership checks, the reference, paired
  tally, views and ads gates, and the 319 day/489 all-time seed batches were
  completed. The independent canonical process sealed all 150 reader
  oracles; all 750 reader-route tally checks completed (745 new scopes and
  five retained scopes). These are setup checks, not measured response parity.

## Calibration evidence and resource attribution

| Calibration window | Declared schedule | Successful complete feeds within window | Successful complete feeds recorded by stop | Other terminal records |
|---|---:|---:|---:|---:|
| Average-rate probe, 120 s | 348 at 2.9/s | 3 (0.025/s) | 33 | 10 |
| Peak-rate burst, 60 s | 900 at 15/s | 0 | 0 | 2 |

The declared schedule is not a reconciled offered/started count. The stopped
controller had 45 terminal records, including 33 complete feeds, with live
backlog outstanding. A main-query HTTP 200 is not a complete feed. These
calibration counts are not sustained rates, and the stopped sample is not a
latency distribution. The measured-window parity gate and G2 drain were not
run. The original incomplete controller record is retained alongside the
supervisor stop; no queued application request is counted as a completion.

Calibration least-squares slopes use the sampled elapsed seconds, not sample
indices. The second trace covers only the observed first 30.1 seconds of the
burst; it cannot establish a two-half or sustained trend there.

| Debt quantity | Average probe start → end | Slope/s | Burst start → end | Slope/s |
|---|---:|---:|---:|---:|
| In-flight feed reads | 1 → 343 | +2.91 | 347 → 758 | +13.65 |
| Tracked ClickHouse memory, bytes | 2,511,340,043 → 2,444,545,250 | +248,156 | 2,462,175,271 → 2,354,196,183 | −3,541,902 |
| Host summed RSS, KiB | 3,525,564 → 3,784,424 | +1,967 | 3,709,604 → 3,642,192 | −2,216 |
| Available disk, bytes | 280,794,857,472 → 281,611,100,160 | +2,409,722 | 281,600,495,616 → 281,603,448,832 | +121,160 |
| Active merge bytes remaining / pending mutations | 0 / 0 → 0 / 0 | 0 / 0 | 0 / 0 → 0 / 0 | 0 / 0 |
| Parts: documents / doc links / engagement copy / events | 1 / 2 / 7 / 7, unchanged | 0 | 1 / 2 / 7 / 7, unchanged | 0 |

The average probe had ten samples spanning 116.6 seconds; the burst had
three samples spanning 30.1 seconds. Virtual `vda1` counters recorded zero
device read bytes over both observed intervals and about 488 MB and 107 MB
written, respectively. Those cache-warm samples do not certify storage supply.

On the final calibration source `9f2837d343c0b145dd38eb4151878e28b4fa633a`,
a ten-second diagnostic observed **0.98 API CPU cores**, **21.08 ClickHouse
CPU cores** and **69.2% guest CPU busy**. SQL parsing/rendering appeared in
**145 of 190** sampled API GIL-held stacks. The API descriptor count in the
last resource sample was 331 in the serving process, below the verified
65,536 limit. This identifies pressure in the single-worker API path despite
available guest cores, not an exclusive hardware or engine-root-cause proof.

The final calibration memory sample is a point observation, not a peak or a
32 GiB sizing claim:

| Memory | GiB |
|---|---:|
| ClickHouse cgroup current | 20.56 (17.98 file-backed) |
| API cgroup current / summed API process RSS | 0.27 / 0.28 |
| Host page cache and buffers | 54.27 |
| OS, other processes and unattributed residual | 2.49 |
| Host occupied / reported available | 58.89 / 58.63 |

Do not add cgroup current or process RSS to host occupied: they overlap file
cache. The separate host partition is about 1.90 GiB engine anonymous plus
0.23 GiB API anonymous plus 54.27 GiB page cache/buffers plus 2.49 GiB residual.

## Custody and cleanup

The source and attempt logs retain the startup permission repair, old
membership and DDL refusals, client timeout, sampler failure, descriptor
exhaustion, and subsequent calibration profiles. No earlier result was
rewritten and no second droplet was provisioned.

The supervisor stopped calibration only after preventing new API submissions
and verifying **zero active native queries**. The private off-host archive
`dau-after-1722-20261127T185136Z-077569695d-receipt.tar.gz` (261,396,868 bytes)
verified to SHA-256
`e5ddd8bc1f08319805670820412c2a3007fd2370c8269dfa6942ac5ccd37d571` **before
owned cleanup**. Provider readback verified the droplet and owned temporary
resources gone; the original snapshot is retained. **Estimated compute:
$14.8703 of $25**, not an invoice; snapshot replication/storage is separate.
