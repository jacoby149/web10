# Sustained DAU: frozen reader-authority preflight refused

**Disposition: `PREFLIGHT_READER_AUTHORITY_REFUSED`.** The exact banked K20
request and its authority yield **one eligible principal, not the required
150**. This is an input/authority finding, not a calibration result, a
hardware sizing refusal, a measured response divergence, or a throughput
result. Calibration, warm-up, peak, average, and drain are all **NOT RUN**.
No throughput, latency, debt slope, capacity, or resource-binding figure
can be claimed for this test.

## Store and preparation

The frozen million-account Parquet inputs descended from retained snapshot
`255003176`. The destination verified the independent validation receipt,
dataset identity `2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`,
and every manifest file by SHA-256. The fresh import reconciled 88,200,300
documents, 92,200,600 document-group links, and 1,600,000,000 platform events.
ClickHouse `26.10.4.207` reported the admitted 28 GiB container and 22 GiB
server limits. The restore receipt and initial canonical fingerprint were
banked before subsequent setup writes.

On the c-16 host (nyc1, provider nominal 32 GB RAM, 200 GB local disk), the
guest exposed **16 vCPUs, one thread per visible core**. No 32-thread
measurement or physical host topology is asserted. The exact-source run
started on merge `65d77e7370be9bc83c8c33c97a4df25135344ae5` (#1704); the
restored store was retained across the merged preparation repair #1705.
The historical admission-vehicle format refusal is preserved, separately
from the execution; it submitted no engine work. The hot-table `OPTIMIZE`
and before/after parts census, read setup, migration, and billboard fixture
setup were saved. Derived preparation was not complete, and no load window
had been issued when the controller was stopped. The stop readback found
zero live owned native queries.

## Exact preflight evidence

The saved ordinary reference requests 21 groups (20 follows and the banked
reader's own group). All 21 are in the banked reader's authorized posts
scope. The operator required identical authority for 150 distinct readers.
The census uses the API's membership order: rank by descending update time
and deletion flag within each `(group_id, member_key)` pair, then discard
deleted heads. Counts are over the exact requested group list in the saved
profile. Members need active membership; a nonmember needs an applicable
`anyone` or `authenticated` group grant.

| Check | Observed |
|---|---:|
| Required distinct prepared readers | 150 |
| Principals with all 21 current memberships | 1 |
| Principals with 20 of the 21 | 4 |
| Requested groups with an active `anyone` row | 0 |
| Requested groups with an active `authenticated` row | 0 |

Native `dau-preflight-k20-authority-20261127` finished with code 0. The SQL,
result, query-ID receipts, exact saved profile, and input-manifest digest
are in private custody. This is an upper bound on possible qualifying
readers, not 150 attempted API logins. No grants were added, no reader,
request, or store was substituted, and the c-16 was not upsized.

## Custody and compute

Archives verified off-host before deletion:

| Artifact | SHA-256 |
|---|---|
| `dau-c16-preflight-evidence.tgz` (358,129 bytes) | `5326b17786873d5b1b5328f69e549d4d844fb797089afdc7e492b135bd3ad61d` |
| `dau-c16-restore-receipts.tgz` | `64747c20bb0d8d074afebe6b86e36cb7b967d6a29837f73c78e8b59b5b595f63` |
| `nyc2-dau-sustain-20261126-evidence.tgz` (280,683 bytes) | `2caec2e759fdb6c32052e93c6a3869d779e130fa5279faffb977ab39ca19fba9` |
| `dau-nyc2-native.jsonl.gz` | `31aa5c120148473e291f535d81b2234ad5127a7d12adbd243965061a8b45f329` |

The superseded nyc2 preparation host `623719164` was gone by 00:42:00 UTC
after the new host's full input verification; it ran no load windows. The
nyc1 c-16 `623780432`, sizing probe `623780369`, owned firewalls, SSH key,
and tags were absent at cleanup readback by 01:45:06 UTC on 27 November.
Snapshot `255003176` was present in nyc3. Estimated compute to readback was
$20.289 (nyc2) + $1.971 (nyc1), plus a brief provisioning probe: about
**$22.27 of the $25 cap**, not an invoice; storage and cross-region egress
are separate. No additional host or retry was admitted.
