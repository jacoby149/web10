"""One exact operator-file-admitted crash; no HTTP flag or production import."""
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import re

from arm_f_native import save


def check(root, operation, actor, phase, *, exit_process=os._exit):
    root = Path(root)
    path = root / 'fault-admission.json'
    if not path.is_file():
        return
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError('fault control must be an operator-owned private regular file')
    value = json.loads(path.read_bytes())
    if (value.get('operation_id') != operation or value.get('actor_key') != actor or value.get('phase') != phase):
        return
    if (phase not in ('after_apply', 'after_reconcile') or not re.fullmatch(r'[a-f0-9-]{36}:publish', operation)
            or datetime.fromisoformat(value['expires_utc']) <= datetime.now(UTC)):
        raise ValueError('invalid/expired exact fault admission')
    save(root / 'fault-fired.json', dict(operation_id=operation, actor_key=actor, phase=phase, exit_code=86))
    path.unlink()
    directory = os.open(root, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    exit_process(86)
