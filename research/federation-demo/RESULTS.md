# Cross-node correctness: one completed isolated run

**Passed 3 November 2026, with an explicit source prerequisite:** revision
`04da544442c33a99df1203866ba83efa1c8b4251` plus the retained patch containing
the owner-list repair proposed in **PR #1360 (`f3e8e354b`)**. This branch alone,
before that repair merges, has not passed clean-base replay. The paper must
retain that distinction.

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
- The successful receipt records eight running containers, no published ports
  or OOM flags, source patch plus executable snapshots, schema/lock/build inputs,
  image identities, named lifecycle outcomes and synthetic document IDs.
- Cleanup verifies containers, networks, volumes, the unique image tag and
  temporary private material were removed. Full private Compose/environment
  dumps were not collected. Selected receipts live in [evidence/](evidence/).
- Fresh same-model review validates this bounded interpretation and identifies
  a diagnostic-collection cleanup gap. The current runner catches diagnostic
  failures before teardown; `test_lifecycle.py` fault-injects inspection failure
  and confirms teardown plus a failed exit. This robustness adjustment postdates
  the successful snapshot and is not a new connected run.

## Limits

The network is Docker-internal with deliberately globally classified addresses;
production public-address validation is enabled, but this is not public-network
deployment evidence. Test CA and single-process caches are deliberate fixtures.
Storage instances are separate, but media delivery is not exercised. Browser
consent/CORS enforcement, foreign self-join, complete principal migration,
production signing-key provisioning, multiworker/restart behavior, issuer
revocation/expiry lifecycle, media capability revocation, capacity and latency
bounds remain OPEN. One successful correctness run is not full federation,
L1–L4/model-diverse assurance or SIGMOD submission readiness.
