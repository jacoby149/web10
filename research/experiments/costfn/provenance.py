"""Content-only source fingerprints; no git status or secret/environment dumps."""
import hashlib
from pathlib import Path


def tree_hash(root, pattern="*.py"):
    root = Path(root)
    result = hashlib.sha256()
    for path in sorted(root.rglob(pattern)):
        if "__pycache__" not in path.parts:
            result.update(path.relative_to(root).as_posix().encode() + b"\0" + path.read_bytes() + b"\0")
    return result.hexdigest()


def sources():
    here = Path(__file__).resolve().parent
    return {"api_python_sha256": tree_hash(here.parents[2] / "api/app"),
            "api_lock_sha256": hashlib.sha256((here.parents[2] / "api/uv.lock").read_bytes()).hexdigest(),
            "research_compose_sha256": hashlib.sha256(b"".join((here / n).read_bytes() for n in ("compose.yml", "research.compose.yml", "distributed.compose.yml"))).hexdigest(),
            "harness_python_sha256": tree_hash(here),
            "pagination_capture_sha256": hashlib.sha256((here / "evidence/core-feed-next-page-v3.json").read_bytes()).hexdigest(),
            "wire_sha256": hashlib.sha256((here / "evidence/core-feed-wire-v4.json").read_bytes()).hexdigest()}


def runtime(compose, db_compose, env):
    import json
    import subprocess
    from topology import docker_prefix
    result = {}
    for role, command in (("api", compose), ("db", db_compose)):
        ids = subprocess.run(command + ["ps", "-q"], check=True, capture_output=True, text=True, env=env, timeout=20).stdout.split()
        result[role] = [json.loads(line) for line in subprocess.run(docker_prefix(command) + ["inspect", "--format",
            '{"name":{{json .Name}},"image_id":{{json .Image}},"image_ref":{{json .Config.Image}}}', *ids],
            check=True, capture_output=True, text=True, env=env, timeout=20).stdout.splitlines()]
    script = "import importlib.metadata as m,json,platform; print(json.dumps({'python':platform.python_version(),'packages':{n:m.version(n) for n in ['fastapi','starlette','sqlglot','clickhouse-connect','uvicorn','PyJWT','bcrypt']}}))"
    result["api_software"] = json.loads(subprocess.run(compose + ["exec", "-T", "api", "uv", "run", "python", "-c", script],
        check=True, capture_output=True, text=True, env=env, timeout=30).stdout)
    result["clickhouse_version"] = subprocess.run(db_compose + ["exec", "-T", "clickhouse", "clickhouse-client", "--user", "web10", "--password", "web10", "--query", "SELECT version()"],
        check=True, capture_output=True, text=True, env=env, timeout=20).stdout.strip()
    return result
