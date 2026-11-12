# Persistent-volume preparation — 12 November 2026

## Actually started, not just approved

The operator selected **Approve and start** for one NYC3 8-vCPU/32-GiB
`s-8vcpu-32gb-amd` preparation host ($0.25/hour, up to 14 hours under the $5
compute ceiling) and a 400-GiB persistent Volume ($40/month prorated hourly).
Keep the volume after compute cleanup, review retention after seven days, and
require a separate decision before deleting the only dataset copy.

- New run ID: `3ef3634d8983`; the deleted prior lease stays closed.
- Droplet ID: `618505005`.
- Volume ID: `d01c584d-de97-11f1-8944-c234aeb68f7e`, 400 GiB in NYC3.
- Filesystem UUID: `da9454f1-3590-4774-8b1d-cabfb2b644db`.
- Work path: `/mnt/costfn-work/costfn-prep/`.
- Worker started at **12:53:23 UTC**; state at launch is **generating 1M accounts**.
- Approved compute deadline: **02:50:22 UTC on 13 November**. Worker runtime
  stops ten minutes earlier; a host timer powers off at the deadline. Poweroff
  does not stop provider billing: the owner/account/known-ID local watchdog does
  scoped cloud deletion. Local/network/provider loss can delay deletion; no
  provider-enforced billing cap is claimed. Compute cleanup preserves the Volume.

## Checks and retained evidence

Account/catalog checks found no existing droplets/volumes before creation.
Pinned SSH authentication succeeds without accepting an unknown host key.
The new volume is provider-preformatted ext4; no existing disk is reformatted.
The exact approved device mounts at `/mnt/costfn-work`; filesystem UUID and free
space are verified. A synced setup probe survives **unmount/remount on the same
host** with matching SHA-256. This is not a replacement-host test or a backup.
Initial free space: **404,409,954,304 bytes**.

All transferred source hashes match. Pinned runtime installation and the six
offline volume controls pass on the host. Source files, hashes and setup/mount
receipts are also kept on the persistent volume (`setup-code/`, `setup.json`),
with no provider management credential or private SSH key copied there.

The worker reports `persistent_work=true`, holds its one-process lock, appends
stdout/stderr to `run.log`, and writes synced atomic `cloud-status.json` on the
volume. A host-local 20-second timer checks the exact filesystem UUID and stops
work if free space falls below 20 GiB; its actual mounted-disk probe passes.
The compute watchdog is independently armed on the Mac; its limitation remains
workstation/network dependence. The volume, not that observer, preserves bytes.

The initial SSH-key CLI flag refusal occurred before billed resources existed;
the same run/keys/deadline were continued after verifying no key was created.
A reserve-helper quoting error was compiled/probed and corrected with the worker
PID unchanged. Safe setup failures and their logs are retained in private ops
state; neither is a dataset measurement or a reason to create a duplicate host.

## Scope remains preparation

Use explicit `--skip-floor-gates`: no repeated 100k prerequisite pipeline.
Final independent 1M validation is still required. Generation, independent
validation and persistent work are not claims that Spaces/MinIO copies exist,
statistics have been reviewed, connected node/parity gates pass, or experiments
have started. No study fleet, public upload or production change is performed.

Latest local summary: `.context/REALISM-CLOUD-STATUS.md`. Primary durable status
and logs are on the Volume. Actual live phase can change; this receipt freezes
the successful launch, not a completion percentage or ETA.
