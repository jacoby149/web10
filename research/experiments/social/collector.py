"""Disposable orchestration and allowlisted evidence; no cloud lifecycle operations."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SERVICES = {"api", "ui", "social", "rtc", "proxy", "clickhouse", "minio"}


def command(args, *, env=None, data=None, timeout=120):
    with subprocess.Popen(args, cwd=ROOT, env=env, stdin=subprocess.PIPE,
                          text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                          start_new_session=True) as process:
        try:
            output, _ = process.communicate(data, timeout=timeout)
        except BaseException:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            raise
        if process.returncode:
            raise subprocess.CalledProcessError(process.returncode, args)
        return output.strip()


def results_parent(root):
    # Only this fixed parent is accepted. Reject symlinks before creating anything.
    if any(k in os.environ for k in ("WEB10_RESULTS_DIR", "EVAL_RESULTS_DIR", "WEB10_EVAL_RESULTS", "WEB10_EVAL_RESULTS_DIR")):
        raise RuntimeError("Results directories are generated, not supplied")
    parent = root / ".context" / "evaluation"
    for path in (root / ".context", parent):
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise RuntimeError("Unsafe artifact parent")
    if not parent.resolve().is_relative_to(root.resolve()):
        raise RuntimeError("Artifact parent escapes checkout")
    return parent


def query_timings(text):
    for line in text.splitlines():
        if "[query]" not in line or "timing_ms" not in line:
            continue
        values = dict(re.findall(r"\b(auth|app_contract|parse_validate|candidates|readable|group_meta|compile|execute|serialize|prepare|total)=([0-9]+(?:\.[0-9]+)?)(?=\s|$)", line.split("timing_ms", 1)[1]))
        if values:
            yield {key: float(value) for key, value in values.items()}


def source_hashes():
    paths = [p for p in HERE.rglob('*') if p.is_file() and
             p.suffix in {'.ts', '.mjs', '.py', '.sh', '.conf', '.yml', '.yaml'}]
    paths += [ROOT / 'e2e/package.json', ROOT / 'e2e/package-lock.json']
    if any(not p.resolve().is_relative_to(ROOT) for p in paths):
        raise RuntimeError('Source input escapes checkout')
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(paths)}


def main():
    if os.environ.get("WEB10_DISPOSABLE") != "social-evaluation":
        raise RuntimeError("Requires WEB10_DISPOSABLE=social-evaluation on a fresh disposable Ubuntu host")
    if Path.cwd().resolve() != ROOT:
        raise RuntimeError("Run from the repository root")
    for name, default, minimum, maximum in (("WEB10_EVAL_REPETITIONS", "20", 3, 100),
                                             ("WEB10_EVAL_WARMUP", "2", 0, 10)):
        value = os.environ.get(name, default)
        if not re.fullmatch(r"[0-9]+", value) or not minimum <= int(value) <= maximum:
            raise RuntimeError(f"{name} must be {minimum}..{maximum}")
    if os.environ.get("E2E_HTTP_PORT", "80") != "80":
        raise RuntimeError("E2E_HTTP_PORT must be 80")
    if command(["uname", "-s"]) != "Linux":
        raise RuntimeError("Requires a fresh Linux Docker host")
    if 'ID=ubuntu' not in Path('/etc/os-release').read_text().replace('"', ''):
        raise RuntimeError("Requires Ubuntu")
    for binary in ("docker", "node", "npm", "git"):
        if not shutil.which(binary):
            raise RuntimeError("Missing dependency: " + binary)
    # No writes or provisioning before this gate. Ignore inherited Docker routing.
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("COMPOSE_", "DOCKER_"))}
    env["DOCKER_HOST"] = "unix:///var/run/docker.sock"
    if command(["docker", "ps", "-q"], env=env):
        raise RuntimeError("Refusing host with running Docker containers")
    command(["docker", "compose", "version"], env=env)
    parent = results_parent(ROOT)
    for host in ("api.localhost", "auth.localhost", "social.localhost", "rtc.localhost", "marketing.localhost"):
        try:
            addresses = socket.getaddrinfo(host, 80, family=socket.AF_INET)
            if not addresses or any(address[4][0] != "127.0.0.1" for address in addresses):
                raise OSError("not loopback")
        except OSError:
            raise RuntimeError("Map api.localhost auth.localhost social.localhost rtc.localhost marketing.localhost to 127.0.0.1 in /etc/hosts before running") from None
    if any(re.search(r"(?:BASE_?URL|API_BASE|SOCIAL_BASE|AUTH_BASE|RTC_BASE)$", k, re.I) for k in env):
        raise RuntimeError("Target overrides are not permitted")
    repetitions = int(os.environ.get("WEB10_EVAL_REPETITIONS", "20"))
    if not 3 <= repetitions <= 100:
        raise RuntimeError("WEB10_EVAL_REPETITIONS must be 3..100")
    config = HERE / "playwright.config.ts"
    templates = sorted((ROOT / "clickhouse-init").glob("*.sql.template"))
    if not templates:
        raise RuntimeError("Missing ClickHouse schema templates")
    try:
        revision = command(["git", "rev-parse", "HEAD"])
        dirty = bool(command(["git", "status", "--porcelain", "--untracked-files=all"]))
    except subprocess.SubprocessError:
        raise RuntimeError("Cannot verify clean committed checkout; check git status locally") from None
    if dirty:
        raise RuntimeError("Requires a clean committed checkout, including all experiment files; inspect git status locally")
    cli = ROOT / "e2e/node_modules/@playwright/test/cli.js"
    if not config.is_file() or not cli.is_file() or not all((ROOT / 'e2e' / name).is_file() for name in ('package.json', 'package-lock.json')):
        raise RuntimeError("Requires social/playwright.config.ts and npm ci --prefix e2e")
    versions = json.loads(command(["node", "--input-type=module", "-e",
             "import {chromium} from './e2e/node_modules/@playwright/test/index.mjs'; "
             "import {readFileSync} from 'node:fs'; "
             "const b=await chromium.launch({headless:true}); "
             "try { console.log(JSON.stringify({node:process.version, "
             "playwright:JSON.parse(readFileSync('./e2e/node_modules/@playwright/test/package.json','utf8')).version, "
             "chromium:b.version()})); } finally { await b.close(); }"], env=env))
    if (not isinstance(versions, dict) or set(versions) != {'node', 'playwright', 'chromium'} or
            any(not isinstance(v, str) or not re.fullmatch(r'v?[0-9]+(?:\.[0-9]+){1,3}(?:[-+][A-Za-z0-9.-]+)?', v)
                for v in versions.values())):
        raise RuntimeError("Invalid browser-tool version evidence")
    hashes = source_hashes()
    for port in (80, 9000):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", port))
    runid = secrets.token_hex(12)
    project = "web10-eval-" + runid
    parent.mkdir(parents=True, exist_ok=True)
    out = parent / runid
    out.mkdir(mode=0o700)
    env.update(SOURCE_REVISION=revision, EVAL_SIGNING_KEY=secrets.token_hex(48),
               WEB10_EVAL_RESULTS=str(out), WEB10_EVAL_REPETITIONS=str(repetitions),
               WEB10_EVAL_PROJECT=project)
    compose = ["docker", "compose", "--project-name", project, "--file", str(HERE / "compose.yml"),
               "--env-file", "/dev/null"]
    manifest = dict(run_id=runid, project=project, source_revision=revision, source_dirty=dirty,
                    source_sha256=hashes, browser_tools=versions,
                    provenance_policy="Clean committed checkout required; ignored artifacts are not source identity. Production inputs identified by source_revision and locally built image IDs.",
                    isolation="Compose internal runtime network; browser HTTP/WS guards and WebRTC exclusion belong to the scenario. Build-time registry access is permitted. Not a full OS sandbox; host firewall unchanged.",
                    started_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    exit_status=None, phases=[], failures=[], repetitions=repetitions,
                    warmups=int(os.environ.get("WEB10_EVAL_WARMUP", "2")),
                    cleanup_succeeded=None, cleanup_note="No project resources created yet",
                    query_timing_scope="All available API query timings from the fresh project lifetime, including setup, correctness, warmups and measurement; not attributed to individual operations.",
                    schema_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in templates},
                    caveat="Browser and services share the host; not production or remote-client latency.",
                    policy="Production builds; synthetic fixtures may configure development-mode policy only in tests.",
                    hardware=dict(kernel=command(["uname", "-sr"]), arch=command(["uname", "-m"]),
                                  cpu_count=os.cpu_count(), os="Ubuntu",
                                  memory_bytes=os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")), images=[])
    stop = threading.Event()
    sampler = None
    created = False
    status = 1

    def save():
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    def dc(*args, data=None, timeout=120):
        return command(compose + list(args), env=env, data=data, timeout=timeout)

    def failure(name, error):
        # Fixed guidance and allowlisted classes only; exception messages/args may contain secrets.
        kind = ("CommandExit" if isinstance(error, subprocess.CalledProcessError) else
                "Timeout" if isinstance(error, subprocess.TimeoutExpired) else
                "Interrupted" if isinstance(error, SystemExit) else
                "InvalidEvidence" if isinstance(error, (ValueError, KeyError)) else
                "IOFailure" if isinstance(error, OSError) else "OrchestrationError")
        hint = {
            "build": "Check registry access, disk space and the production Dockerfiles; no service resources were started.",
            "storage": "Check ClickHouse/MinIO startup and Docker disk/memory availability; partial startup is cleaned up.",
            "services": "Check production service startup, image identities and available host resources.",
            "readiness": "Check localhost routing and service health; the bounded readiness deadline failed.",
            "social-tests": "Inspect sanitized run.json and operations.json for the failing scenario operation.",
            "report": "The safe scenario report is missing, malformed or unsuccessful.",
            "cleanup": "Project cleanup failed; inspect only the recorded project and remove its resources before disposing of the host.",
            "collection": "Allowlisted evidence collection failed; measurements are incomplete.",
            "sampling": "Docker stats sampling failed; resource measurements are incomplete.",
        }.get(name, "Check the recorded phase and schema/image identity; no raw logs or exception payloads were retained.")
        row = dict(phase=name, failure_class=kind, action=hint)
        if isinstance(error, subprocess.CalledProcessError):
            row["exit_status"] = error.returncode
        manifest["failures"].append(row)
        return row

    def owned():
        ids = command(["docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=" + project], env=env).split()
        rows = []
        for cid in ids:
            info = json.loads(command(["docker", "inspect", cid], env=env))[0]
            labels = info["Config"]["Labels"]
            if labels.get("com.docker.compose.project") != project or labels.get("com.docker.compose.service") not in SERVICES:
                raise RuntimeError("Foreign container in project")
            rows.append((cid, labels["com.docker.compose.service"], info["Image"]))
        return rows

    def sample():
        with (out / "docker-stats.jsonl").open("a") as stream:
            while not stop.is_set():
                try:
                    ids = [row[0] for row in owned()]
                    if ids:
                        raw = command(["docker", "stats", "--no-stream", "--format", "{{json .}}", *ids], env=env, timeout=15)
                        for line in raw.splitlines():
                            row = json.loads(line)
                            safe = {k: row[k] for k in ("ID", "CPUPerc", "MemUsage", "MemPerc", "NetIO", "BlockIO", "PIDs") if k in row}
                            stream.write(json.dumps(dict(timestamp=time.time(), stats=safe)) + "\n")
                        stream.flush()
                except Exception as error:
                    if not manifest.get("sampling_failed"):
                        failure("sampling", error)
                    manifest["sampling_failed"] = True
                stop.wait(2)

    def phase(name, action):
        row = dict(name=name, started_at=time.time(), exit_status=None)
        manifest["phases"].append(row)
        save()
        try:
            action()
            row["exit_status"] = 0
        except BaseException as error:
            row["exit_status"] = error.returncode if isinstance(error, subprocess.CalledProcessError) else 1
            row["failure"] = failure(name, error)
            raise
        finally:
            row["finished_at"] = time.time()
            save()

    def interrupted(signum, _frame):
        raise SystemExit(128 + signum)

    def ready():
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        deadline = time.monotonic() + 180
        urls = ["http://localhost/__experiment", "http://api.localhost/openapi.json",
                "http://auth.localhost/", "http://social.localhost/", "http://localhost:9000/minio/health/live"]
        for url in urls:
            while True:
                try:
                    with opener.open(url, timeout=3) as response:
                        if url.endswith('/__experiment') and response.read() != b'{"experiment":"web10-social-isolated"}':
                            raise RuntimeError("Wrong experiment proxy")
                    break
                except Exception:
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Readiness deadline exceeded") from None
                    time.sleep(2)

    save()
    print("Evaluation artifacts: " + str(out), flush=True)
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, interrupted)
    try:
        phase("build", lambda: dc("build", timeout=1800))
        created = True  # Partial 'up' is owned and must also be torn down.
        phase("storage", lambda: dc("up", "-d", "--wait", "--wait-timeout", "180", "clickhouse", "minio", timeout=240))
        for template in templates:
            sql = template.read_text().replace("${CLICKHOUSE_DB}", "web10")
            phase("schema:" + template.name, lambda sql=sql: dc("exec", "-T", "clickhouse", "clickhouse-client", "--password", "disposable", "--database", "web10", "--multiquery", data=sql))
        phase("services", lambda: dc("up", "-d", "--no-build", timeout=180))
        phase("readiness", ready)
        def identity():
            manifest["clickhouse_version"] = dc("exec", "-T", "clickhouse", "clickhouse-client", "--password", "disposable", "--query", "SELECT version()")
            for cid, service, image in owned():
                details = json.loads(command(["docker", "image", "inspect", image], env=env))[0]
                manifest["images"].append(dict(service=service, image_id=image, repo_digests=details.get("RepoDigests", [])))
        phase("identity", identity)
        sampler = threading.Thread(target=sample, daemon=True)
        sampler.start()
        phase("social-tests", lambda: command(["node", str(cli), "test", "--config", str(config)], env=env, timeout=3600))
        def report():
            if json.loads((out / "run.json").read_text()).get("success") is not True:
                raise RuntimeError("Missing successful safe scenario report")
        phase("report", report)
        status = 0
    except subprocess.CalledProcessError as error:
        status = error.returncode or 1
    except SystemExit as error:
        status = int(error.code)
    except Exception as error:
        if not manifest["failures"]:
            failure("orchestration", error)
        manifest["orchestration_failed"] = True
    finally:
        # Repeated interrupts must not skip evidence/cleanup.
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, signal.SIG_IGN)
        stop.set()
        if sampler:
            sampler.join(timeout=30)
            if sampler.is_alive() or manifest.get("sampling_failed"):
                manifest["sampling_failed"] = True
                status = status or 1
        if created:
            try:
                rows = owned()
                if not manifest["images"]:
                    for _, service, image in rows:
                        details = json.loads(command(["docker", "image", "inspect", image], env=env))[0]
                        manifest["images"].append(dict(service=service, image_id=image, repo_digests=details.get("RepoDigests", [])))
                raw = dc("logs", "--no-color", "api", timeout=30)
                with (out / "query-timings.jsonl").open("w") as stream:
                    for row in query_timings(raw):
                        stream.write(json.dumps(row) + "\n")
            except Exception as error:
                failure("collection", error)
                manifest["collection_failed"] = True
                status = status or 1
            try:
                owned()  # Never tear down a project containing an unexpected service.
                phase("cleanup", lambda: dc("down", "--volumes", "--timeout", "20", timeout=120))
                if owned():
                    raise RuntimeError("Containers survived cleanup")
                manifest["cleanup_succeeded"] = True
                manifest["cleanup_note"] = "Generated project containers and volumes removed"
            except Exception as error:
                if not manifest["failures"] or manifest["failures"][-1]["phase"] != "cleanup":
                    failure("cleanup", error)
                manifest["cleanup_succeeded"] = False
                manifest["cleanup_note"] = "Generated project may have surviving resources"
                status = status or 1
        manifest.update(exit_status=status, finished_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
        save()
    return status


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        # Never print subprocess output, environment, or raw container logs.
        print("Evaluation refused/failed: " + (str(error) if isinstance(error, RuntimeError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
