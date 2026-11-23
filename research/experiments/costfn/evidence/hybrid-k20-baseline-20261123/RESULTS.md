# Indexed K20 baseline: slice construction STOP

**No K20 baseline response was measured.** The first slice dependency expansion
timed out in ClickHouse. The query read **441,001,812 rows** and **31,424,002,570
logical bytes**, peaked at **12,487,662,005 bytes** of query memory, and recorded
**600,060 ms native query duration**. These are partial **setup** costs, not
complete-response data. No end-to-end HTTP time, read-path parity result,
challenger, or fault-suite outcome was produced.

## Binding and stop

- Executed merged [#1623](https://github.com/jacoby149/web10/pull/1623)
  (`55b10b2ddcf713d8dcd4b72210969e3e848e4a46`). The separately recorded model
  baseline remains [#1622](https://github.com/jacoby149/web10/pull/1622).
- One owned DigitalOcean `nyc3` droplet `622714290`, `s-8vcpu-32gb-amd`, with
  ClickHouse `26.10.4.207` and the declared 32/28/22 GiB envelope. Lease
  `23 Nov 21:44:19`–`24 Nov 01:44:19 UTC`; snapshot `255003176` verified.
- Original independent canonical oracles completed, with 21 rows each for
  the ordinary K20 and paired setup profiles. These are not slice parity.
- The slice seed counted **88,200,362 distinct bare IDs** across 25 group
  scopes. Neither profile requested Discover for the main page. The captured
  reactions and comments follow-up scopes both included Discover for both
  profiles. The source constructor unioned those readable scopes into the
  *seed* group set, turning a page-dependent group into a global seed input.
- The first expansion, query `fanout-f-ed7d57d667bb47cb9a359229a75398af`,
  ended `ExceptionWhileProcessing` with native code 159. No replacement table
  copy or exchange ran, no sliced oracle ran, and no runner retry followed.

## What to fix before proposing another run

Seed candidates from the original **main** request; keep all policy metadata
and unchanged follow-up authority. Use reaction/comment/Discover scopes when
resolving dependencies for those candidates, not as global candidate seeds.
Distinguish full candidates from their bare-ID attachment and event lanes and
retain historical versions/tombstones before filtering winners. Avoid global
JSON expansion in each closure round; measure bounded, indexed dependency
selection where possible. Recheck representative parts and exact unsliced
oracle parity before measuring the original K20 request. This is a diagnosis
and suggested source repair, not permission for another lease.

## Evidence custody and cleanup

Original worker STOP and native query-log parts were copied off-host and
SHA-256 verified before resource deletion. Raw state and native parts remain
private; this report contains extracted operational figures only.

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| State and receipts | 44,501 | `87e34fc4bb80ec701dd02f224f81336cb83dc4401593ea02e626ca01fa1760ca` |
| Stopped ClickHouse query-log parts | 6,424,052 | `e97e781a31bb5f8c9aa5ca89ff807820d6eb9375da6dbd081e09175d9ece8a41` |

Droplet, firewall, and SSH key absence verified at `22:14:40.503610 UTC` on
23 November. The owned tag was removed and snapshot `255003176` was retained.
Estimated compute **$0.126493**, not invoice; snapshot storage is separate.
