# A persistent disk for the preparation droplet

**Latest operator scope:** persistence is for the one dataset-creation/validation
droplet. Experiments keep their normal output logs/results; do not build an
experiment checkpoint framework, distributed validator or custom workbench.

## Where the preparation files live

Use one already-mounted DigitalOcean Volume, separate from the disposable
Droplet's root disk. `realism_volume.py` checks the exact mountpoint and expected
filesystem UUID before creating any work directory. It refuses an absent disk,
wrong UUID, parent/root filesystem or symlink; it never creates, formats or mounts
a disk. The worker CLI requires the mountpoint and UUID explicitly.

```text
/mnt/costfn-work/costfn-prep/
  realism-1m-prep/           # final dataset files and manifest
  realism-work-*/           # retained failed generation work
  realism-validate-*/       # retained validation database/work
  realism-clickhouse-*/    # current ClickHouse data and query logs
  realism-partitions-*/     # retained canonical-document partitions
  cloud-status.json         # latest state, atomically replaced and synced
  cloud-validation.json     # final validation receipt, not implied by file presence
  run.log                   # ordinary appended stdout/stderr and failure tracebacks
```

The worker holds one file lock, appends a start line for each attempt, measures
free space on the work disk, and retains validation scratch on this path.
No event bus, scheduler, state-machine framework or custom logging class.

```sh
python research/experiments/costfn/realism_cloud_worker.py \
  --repo /opt/web10-prep/repo \
  --work-volume /mnt/costfn-work \
  --filesystem-uuid <approved-filesystem-uuid> \
  --skip-floor-gates
# On replacement compute with the same volume mounted at the same path:
# add --resume to reverify and reuse completed generation/validation.
# Current validation also requires native ClickHouse 24.8.14.39 (or the
# explicit networkless Docker adapter); see REALISM-CLICKHOUSE.md.
```

The UUID above is the filesystem UUID, not the provider's volume resource ID.
The old controller command without these new arguments deliberately refuses to
start. Direct Python callers without volume arguments retain the existing local
test/offline behavior; cloud use goes through the explicit-volume CLI.

## What recovery means here

Deleting compute must preserve the volume. The creation guard pins the real
provider volume's ID/name/size/region/account and refuses an unrelated attached
droplet. Existing scoped compute cleanup never deletes volumes. The previous
metadata-only archive-drill gate is removed in favor of this concrete disk check.
Volume creation, size/price/retention approval and actual attach/replacement
verification remain operational gates—not claims made by mocked tests.

Attach the retained disk to replacement compute in the same datacenter, install
the pinned source/runtime, inspect state/logs and use existing `--resume` checks.
Completed output is reused only after source/identity/all-file hash verification.
Partial files and retained databases are **not** passing validation or automatic
mid-table/bucket resume witnesses. The unfinished operation may still need
repeating; do not overwrite or silently adopt partial work.

The volume is the work disk, not a backup against corruption or explicit volume
deletion. Separate deletion/retention approval is required and storage continues
to bill while detached. After validation, Spaces distributes the frozen input
and MinIO remains the long-term canonical archive, with exact readback checks.
Measured ClickHouse storage and existing experiment logs/results are unchanged.
No new host/volume, formatting, mount, object write or experiment is performed
by this code change.
