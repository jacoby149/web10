"""Verify an already-mounted preparation disk; never provision or manage disks."""
import json
from pathlib import Path
import subprocess
import uuid


def preparation_directory(mountpoint, filesystem_uuid):
    expected=str(uuid.UUID(filesystem_uuid))
    mount=Path(mountpoint)
    if (not mount.is_absolute() or not mount.is_dir() or mount.is_symlink()
            or mount.resolve()!=mount or mount==Path('/')):
        raise ValueError('explicit existing non-root mountpoint required')
    result=subprocess.run(['findmnt','--json','--mountpoint',str(mount),
                           '--output','TARGET,UUID,FSTYPE'],
                          capture_output=True,text=True,timeout=15)
    if result.returncode:
        raise ValueError('preparation volume is not mounted; refusing root-disk fallback')
    rows=json.loads(result.stdout).get('filesystems',[])
    if (len(rows)!=1 or rows[0].get('target')!=str(mount)
            or rows[0].get('fstype') not in ('ext4','xfs')
            or str(uuid.UUID(rows[0].get('uuid','')))!=expected):
        raise ValueError('preparation mountpoint/filesystem UUID differs from approved disk')
    root=mount/'costfn-prep'
    if root.is_symlink():
        raise ValueError('preparation directory must not be a symlink')
    root.mkdir(mode=0o700,exist_ok=True)
    return root
