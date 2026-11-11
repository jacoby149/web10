# Monitored DigitalOcean preparation — operator approval

**11 November 2026:** the operator approved moving preparation off the
space-constrained Mac: “we have alot of credit, lets do it in a way we can
monitor it, so i ask how is it progressing you can tell me.” This revises the
earlier local-only preparation restriction for **one preparation host**, not
the measured study fleet, production deployment or submission.

## Approved scope

**Latest storage amendment:** [REALISM-STORAGE.md](REALISM-STORAGE.md) governs:
after validation, private region-matched Spaces for rerun delivery **and** the
canonical MinIO copy alongside V2 under the realism ID. Verify both copies'
manifest/file digests. Public posting requires freeze and operator statistics
review and uses MinIO only. Earlier MinIO-only/prefix wording below is history.

- SKU `s-8vcpu-32gb-amd`: **8 vCPU / 32 GiB / 400 GB**, catalogue price
  **$0.25/hour**, actual provisioned shape verified in NYC3.
- Retain the proposed **four-hour deadline / $5 budget target**. The deadline
  is **22:01:22 UTC on 11 November 2026**, retained across a setup replacement;
  it was not reset to hide the first attempt. This is operational cleanup,
  **not a provider-enforced billing guarantee**.
- Generate/independently validate the 1M synthetic store on the larger disk;
  preserve original generator/validator/contract sources and source/byte-bound
  floor prerequisites. The DuckDB preparation budget remains 2 GB. The future
  measured ClickHouse envelope remains 28/22 GiB; no benchmark server is deployed.
- The operator separately selected **Private MinIO staging**, confirming the
  existing web10 MinIO: `https://minio.web10.app`, bucket `web10-media`, exact
  prefix `research/costfn/realism-derived/<dataset-id>/`. Only validated,
  hash-verified data may be staged; no public policy or production-object change.
  Permission is not a claim that credentials/upload are already available.

## Status and monitoring

The active local controller writes `.context/REALISM-CLOUD-STATUS.md` and
`.context/realism-cloud-status.json`: phase, last update, transfer counts,
remote heartbeat, last metadata-only log lines, service state, free disk and
the cleanup deadline. Ask for progress against that snapshot and its age;
do not infer “running” from a directory or report a percentage without evidence.

The controller is `.context/realism_cloud_controller.py` (local operations,
not an end-to-end deployment feature of this PR). The committed
`realism_cloud_worker.py` writes a remote heartbeat every ten seconds and
distinguishes generation, validation failure and validated-but-not-staged.
The controller collects snapshots about every twenty seconds, plus final
status/manifest/validation metadata. The preparation service has its own
runtime limit, leaving time for collection before the lease deadline.

`realism_cloud_lease.py` is copied to an owner-only stable local state directory
and run by a user launch agent every minute, independently of the coding
session, controller and SSH connection. Cleanup pins the cloud account, unique
run/name/tag, known IDs, SKU, firewall ownership and ephemeral public-key
fingerprint. Cancellation is irreversible; uncertain creation cannot be called
verified absence. A changed account/ownership is an error, never a broad delete.
Mac sleep/loss, network or provider failure can delay cleanup; preserve that
limitation rather than claiming a hard billing cap. No provider management
credential is sent to the host. SSH uses a pinned ephemeral host key and
`IPQoS=none`; no unknown host key is accepted.

## Setup attempts (not dataset results)

- Initial host **618230429** reached SSH after applying the documented
  `IPQoS=none` workaround, but failed strict host-key verification. No data was
  transferred and the untrusted key was not accepted. Raw host-key files written
  before cloud-init's SSH module were not a reliable pinning mechanism.
- That owned host, firewall and ephemeral cloud SSH key were deleted and absence
  verified before replacement. Its launch agent was unloaded and local private
  keys retired. This is a setup failure, not a model/performance measurement.
- Replacement **618232415**, `web10-realism-prep-a5727750541f`, uses cloud-init's
  dedicated `ssh_keys` configuration with deletion disabled. Pinned SSH and
  authentication succeeded; measured root free space was **412,904,517,632 bytes**
  at the bootstrap check. Existing source/verified floor transfer completed;
  the 1M/20k-reader generation worker is active at this checkpoint. Current
  generation/validation status is live, not frozen in this doc.

No DO or MinIO credential, private SSH key, user-data payload or runtime lease
belongs in the PR. Active state is protected from artifact cleanup.

## Artifact cleanup

The operator clarified “obsolete research JSON only,” then requested clearing
the generated realism artifacts from the repo. Fourteen **new untracked**
generated JSON/TAR files were removed only after exact backup verification.
The [artifact index](evidence/REALISM-ARTIFACTS.md) retains locations/hashes;
source/tests/plans, existing wire/test fixtures, data manifests and active
monitoring state remain. MinIO publication of that backup is **pending**, not
claimed complete. Required floor receipts are restored at their original
relative paths on the preparation host from the verified recovery bundle.

## Remaining gates

The first 1M preparation attempt was profiled while still before table export:
the active stack was `allocate` at `realism_dataset.py:50`, called by the
impression-body allocation at line 88. It repeatedly scans the large vector
while distributing small integer residuals. The owned service was stopped;
its empty output directory, status and read-only stack evidence were retained.
This is a preparation CPU bottleneck, not a ClickHouse performance result.
The repair batches only provably identical integer-update rounds; targets,
caps, tie ordering, row counts and distributions are not relaxed. Fresh
source-bound floors and preserved-reference data-byte parity gate a restart.

1M generation/validation, artifact persistence and human statistics review are
not closed by successful provisioning. The full Parquet-to-node/selected-cohort
adapter, independent live-view deltas, actual per-service attachment semantics
and complete projected-row/count parity remain separate. No automatic study
fan-out, production migration or CMT submission follows from this preparation.
