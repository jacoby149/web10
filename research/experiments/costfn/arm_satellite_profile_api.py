"""Read-only scope observation on the newly approved isolated research API.

No rewritten SQL, grant substitution, token/body logging or production wiring.
Capture the compiler's ACTUAL per-service readable groups after its caller's
read gate, so the count builder cannot assume equal grants across services.
"""
import json
import importlib
import os
from pathlib import Path

import arm_t
from arm_satellite_runtime import admitted

operation = json.loads(Path(os.environ["SATELLITE_OPERATION"]).read_bytes())
admitted(operation, arm_t.digitalocean_id())

observer = importlib.import_module("research_api")

_compile = observer.original_compile
_directory = Path(os.environ["SATELLITE_SCOPES_DIR"])
if not _directory.is_dir():
    raise RuntimeError("dedicated private profile scope directory required")


def capture_actual_scopes(*args, **kwargs):
    compiled = _compile(*args, **kwargs)  # No SQL changes; original validation first.
    current = observer.current.get()
    readable = args[1] if len(args) > 1 else kwargs.get("readable_groups_by_service")
    reader = kwargs.get("member_key", args[2] if len(args) > 2 else None)
    if current is not None and current["request_id"] != "unlabelled" and isinstance(readable, dict):
        row = {"request_id": current["request_id"], "reader": reader,
               "readable": {service: list(groups) for service, groups in readable.items()}}
        path = _directory / (current["request_id"] + ".jsonl")
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a") as stream:
            stream.write(json.dumps(row) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
    return compiled


observer.original_compile = capture_actual_scopes
application = observer.application
