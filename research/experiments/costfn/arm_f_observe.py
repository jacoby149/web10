"""Content-free research receipts; fanout insert audit is scoped to pointer fields.

No token/body/credential serialization. fsync and audit overhead are inside the
acknowledged write latency and disk accounting, not an off-window free observer.
"""
import json
import os
from pathlib import Path
import re
import threading

import arm_f as f

LOCK = threading.Lock()
FIELDS = ('request_id', 'fanout', 'fanout_publications', 'fanout_membership', 'fanout_scopes',
          'fanout_view_checks', 'arm_p_native', 'arm_p_stop', 'arm_p_native_failure', 'delivery_failures')


def target(root, folder, request):
    if not isinstance(request, str) or not re.fullmatch(r'[a-f0-9]{32}', request):
        raise ValueError('bound research request identity required')
    directory = Path(root) / folder
    directory.mkdir(mode=0o700, exist_ok=True)
    return directory / (request + '.jsonl')


def append(path, row):
    raw = (json.dumps(row, sort_keys=True) + '\n').encode()
    with LOCK:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, 'ab') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())


def request(root, current):
    if not current or current.get('request_id') == 'unlabelled':
        return
    append(target(root, 'requests', current['request_id']), {key: current[key] for key in FIELDS if key in current})


def pointers(root, current, table, rows, columns):
    if table != 'fanout':
        return  # Absolutely no canonical document/user/auth insert capture.
    if columns != f.COLUMNS or not current:
        raise ValueError('pointer-only audit requires explicit expected schema/current owner')
    audit = []
    seen = set()
    for row in rows:
        if len(row) != 7 or any(not isinstance(row[i], str) for i in (0, 2, 3, 4)):
            raise ValueError('invalid pointer audit shape')
        value = [row[0], round(f.publication_time(row[1]).timestamp() * 1000), *row[2:]]
        if tuple(value) in seen:
            raise ValueError('duplicate route inside one physical insert')
        seen.add(tuple(value))
        audit.append(value)
    append(target(root, 'pointer-audit', current['request_id']), {'rows': audit})
