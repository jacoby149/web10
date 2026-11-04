# Cross-node correctness: merged-dev replay passed

**Merged-dev replay passed:** `20261104T000152Z-60683` (4 November UTC,
3 November EST), revision `0acc771e2efc36b9787d38d32450af026eb3895e`, with
an **empty source patch**. At start, clean HEAD exactly matched `origin/dev`
after **PR #1360 merged**. The full unchanged scenario passes without an
overlay or uncommitted runtime change, including the current owner-list repair.

Earlier passes used `04da544442c33a99df1203866ba83efa1c8b4251` plus the
owner-list repair patch and committed owner-fix branch revision
`3be1f1ec10fdb1cdc4ba59b07a4971f1b5087dfa` with an empty patch. All three
successful receipts remain separate; these are not pooled performance trials.

## What happened

Alice logged into A; Bob created a private group and document on B. A and B
used distinct random signing secrets and separate API processes, ClickHouse
instances and MinIO instances. B made a real HTTPS call to A's issuer endpoint
through a TLS proxy with a trusted ephemeral CA and issuer hostname checks.

| B-side group state | `/v3/read` | `/v3/query` |
|---|---:|---:|
| No foreign grant | 403 | 403 |
| Only B's distinct, same-named Alice is a member | 403 | 403 |
| Bob grants A's exact Alice principal | 200, exact document | 200, exact document |
| Bob removes that foreign membership | 403 | 403 |
| Bob regrants it | 200, exact document | 200, exact document |

These are request denials, not inspected empty result sets. All lifecycle reads
use the same JWT. The issuer proxy records only `POST /certify 200` followed by
`POST /certify 401`: one positive certification across the lifecycle, then one
rejected forgery. A second forged-token attempt returns 401 without another
issuer call. B-signed claims naming A never bypass A's authority.

An independent Origin-bearing query returns **403 → 200 → 403** around foreign
app-contract grant and revocation. B's local Alice's app grant is insufficient;
direct group-authorized reads still succeed after app revocation. Both foreign
app-contract operations are labelled **service-function setup fixtures**, not
browser consent, public foreign enrollment or completion of Phase C. Content,
group creation and owner-managed membership changes use actual HTTP APIs.

## Attempts, provenance and cleanup

- `20261103T224940Z-12279`: cold boot completed, but the scenario failed before
  IAM operations with `ModuleNotFoundError: app`; retained as failed.
- `20261103T225210Z-14642`: explicit `PYTHONPATH` fixes that harness import;
  the full scenario passes with no scenario retries.
- `20261103T233658Z-46307`: the full scenario passes again from committed
  revision `3be1f1ec10fd`, with zero-byte `source.patch`, 34 status-only events,
  the same positive/negative issuer-call controls and no scenario retries.
- `20261104T000152Z-60683`: the full unchanged scenario passes on clean merged
  dev `0acc771e2efc`, after #1360 merged; source patch remains zero bytes.
- Each successful receipt records eight running containers, no published ports
  or OOM flags, source patch plus executable snapshots, schema/lock/build inputs,
  image identities, named lifecycle outcomes and synthetic document IDs.
- Cleanup verifies containers, networks, volumes, the unique image tag and
  temporary private material were removed. Full private Compose/environment
  dumps were not collected. Selected receipts live in [evidence/](evidence/).
- Fresh same-model review validates this bounded interpretation and identifies
  a diagnostic-collection cleanup gap. The current runner catches diagnostic
  failures before teardown; `test_lifecycle.py` fault-injects inspection failure
  and confirms teardown plus a failed exit. The second connected run includes
  that hardened runner; fault injection itself is not IAM evidence.
- The earlier owner-branch review kept #1360's then-unmerged status explicit.
  That prerequisite is now merged; historical duplicate rows are still not
  reconciled. No broad or model-diverse security claim follows.
- Fresh bounded review of the merged-dev run verifies exact committed inputs,
  zero-byte patch, 34 events, cache controls and cleanup, and supports local
  H-REPLAY receipt-gate closure. All 1,929 frozen API tests plus eight subtests
  pass, one opt-in skip. Normal PR CI remains required before merging this record.

## Limits

The network is Docker-internal with deliberately globally classified addresses;
production public-address validation is enabled, but this is not public-network
deployment evidence. Test CA and single-process caches are deliberate fixtures.
Storage instances are separate, but media delivery is not exercised. Browser
consent/CORS enforcement, foreign self-join, complete principal migration,
production signing-key provisioning, multiworker/restart behavior, issuer
revocation/expiry lifecycle, media capability revocation, capacity and latency
bounds remain OPEN. These correctness runs are not full federation,
L1–L4/model-diverse assurance or SIGMOD submission readiness.
