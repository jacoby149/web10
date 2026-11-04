"""Local-only, self-cleaning two-node correctness runner; no production targets."""

import hashlib
import json
import os
import secrets
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
run_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + f"-{os.getpid()}"
OUT = ROOT / ".context/federation-demo" / run_id
PROJECT = f"web10-federation-{run_id.lower()}"
IMAGE = f"web10-federation-demo:{run_id}"
OUT.mkdir(parents=True, mode=0o700)
os.umask(0o077)


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


if any(
    name in os.environ
    for name in [
        "DOCKER_HOST",
        "DOCKER_TLS_VERIFY",
        "DOCKER_CERT_PATH",
        "DOCKER_API_VERSION",
    ]
):
    raise SystemExit("Unset remote/override Docker environment variables first")
endpoint = run(
    ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
    capture_output=True,
).stdout.strip()
if not endpoint.startswith("unix://"):
    raise SystemExit("Only a local Unix Docker socket is supported")
docker = ["docker", "--host", endpoint]
revision = run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True).stdout.strip()
(OUT / "source.patch").write_text(run(["git", "diff", "HEAD"], cwd=ROOT, capture_output=True).stdout)
(OUT / "source.json").write_text(
    json.dumps(
        {
            "revision": revision,
            "runner_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "scenario_sha256": hashlib.sha256((HERE / "scenario.py").read_bytes()).hexdigest(),
        }
    )
)
for source in [
    Path(__file__),
    HERE / "scenario.py",
    ROOT / "api/uv.lock",
    ROOT / "api/Dockerfile",
    *sorted((ROOT / "clickhouse-init").glob("*.template")),
]:
    shutil.copyfile(source, OUT / source.name)
(OUT / "recovery.txt").write_text(
    f"Only inspect/remove resources labelled com.docker.compose.project={PROJECT}; image tag {IMAGE}.\nDocker endpoint: {endpoint}\nNo global prune.\n"
)
status = {"result": "failed", "cleanup": False}
with (
    tempfile.TemporaryDirectory(prefix="private-", dir=OUT.parent) as private,
    (OUT / "build.log").open("w") as log,
):
    private = Path(private)

    def openssl(*args):
        run(["openssl", *args], stdout=log, stderr=log)

    openssl(
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=web10-demo-only",
        "-keyout",
        str(private / "ca.key"),
        "-out",
        str(private / "ca.crt"),
    )
    services = {}
    for node in ["a", "b"]:
        host = f"node-{node}.federation.test"
        openssl(
            "req",
            "-new",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-subj",
            f"/CN={host}",
            "-keyout",
            str(private / f"{node}.key"),
            "-out",
            str(private / f"{node}.csr"),
        )
        (private / f"{node}.ext").write_text(f"subjectAltName=DNS:{host}\nextendedKeyUsage=serverAuth\n")
        openssl(
            "x509",
            "-req",
            "-in",
            str(private / f"{node}.csr"),
            "-CA",
            str(private / "ca.crt"),
            "-CAkey",
            str(private / "ca.key"),
            "-CAcreateserial",
            "-days",
            "1",
            "-extfile",
            str(private / f"{node}.ext"),
            "-out",
            str(private / f"{node}.crt"),
        )
        (private / f"{node}.conf").write_text(
            f"events {{}}\nhttp {{ log_format receipt '$request_method $uri $status'; access_log /tmp/certify.log receipt; server {{ listen 443 ssl; ssl_certificate /tls/{node}.crt; ssl_certificate_key /tls/{node}.key; location / {{ proxy_pass http://api-{node}:80; }} }} }}\n"
        )
        services[f"db-{node}"] = {
            "image": "ghcr.io/jacoby149/base-clickhouse:24.8",
            "environment": {
                "CLICKHOUSE_DB": "web10",
                "CLICKHOUSE_USER": "demo",
                "CLICKHOUSE_PASSWORD": "synthetic-demo-db",
            },
            "ulimits": {"nofile": {"soft": 262144, "hard": 262144}},
        }
        services[f"store-{node}"] = {
            "image": "ghcr.io/jacoby149/base-minio:latest",
            "command": ["server", "/data"],
            "environment": {
                "MINIO_ROOT_USER": "demo-store",
                "MINIO_ROOT_PASSWORD": "synthetic-demo-store",
            },
        }
        services[f"api-{node}"] = {
            "image": IMAGE,
            "command": [
                "/web10/.venv/bin/uvicorn",
                "app.main:app",
                "--host",
                "0.0.0.0",
                "--port",
                "80",
            ],
            "volumes": [f"{private / 'ca.crt'}:/tls/ca.crt:ro", f"{HERE}:/demo:ro"],
            "environment": {
                "PROVIDER": host,
                "PRIVATE_KEY": secrets.token_urlsafe(48),
                "PYTHONPATH": "/web10",
                "CLICKHOUSE_HOST": f"db-{node}",
                "CLICKHOUSE_DATABASE": "web10",
                "CLICKHOUSE_USER": "demo",
                "CLICKHOUSE_PASSWORD": "synthetic-demo-db",
                "S3_ENDPOINT": f"http://store-{node}:9000",
                "S3_ACCESS_KEY": "demo-store",
                "S3_SECRET_KEY": "synthetic-demo-store",
                "SSL_CERT_FILE": "/tls/ca.crt",
                "VERIFY_REQUIRED": "",
                "STRIPE_TEST_KEY": "synthetic-disabled",
            },
        }
        services[f"tls-{node}"] = {
            "image": "nginx:alpine",
            "volumes": [
                f"{private / (node + '.crt')}:/tls/{node}.crt:ro",
                f"{private / (node + '.key')}:/tls/{node}.key:ro",
                f"{private / (node + '.conf')}:/etc/nginx/nginx.conf:ro",
            ],
            "networks": {
                "lab": {
                    "aliases": [host],
                    "ipv4_address": f"11.252.77.{10 if node == 'a' else 11}",
                }
            },
        }
    for service in services.values():
        service.setdefault("networks", ["lab"])
    # Isolated, non-published lab routing; public classification deliberately
    # exercises the unchanged production address guard, not public reachability.
    config = {
        "services": services,
        "networks": {
            "lab": {
                "internal": True,
                "ipam": {"config": [{"subnet": "11.252.77.0/24"}]},
            }
        },
    }
    (OUT / "topology.json").write_text(
        json.dumps(
            {
                "services": {
                    name: {
                        "image": spec["image"],
                        "networks": spec["networks"],
                        "published_ports": [],
                    }
                    for name, spec in services.items()
                },
                "networks": config["networks"],
            }
        )
    )
    (private / "compose.json").write_text(json.dumps(config))
    compose = docker + [
        "compose",
        "--env-file",
        "/dev/null",
        "--project-name",
        PROJECT,
        "-f",
        str(private / "compose.json"),
    ]

    def dc(*args, **kwargs):
        return run(compose + list(args), **kwargs)

    try:
        run(docker + ["build", "-t", IMAGE, str(ROOT / "api")], stdout=log, stderr=log)
        dc("up", "-d", "db-a", "db-b", "store-a", "store-b", stdout=log, stderr=log)
        for node in ["a", "b"]:
            sql = [
                "exec",
                "-T",
                f"db-{node}",
                "clickhouse-client",
                "--user",
                "demo",
                "--password",
                "synthetic-demo-db",
                "--database",
                "web10",
                "--multiquery",
            ]
            for attempt in range(90):
                try:
                    dc(*sql, input="SELECT 1", stdout=log, stderr=log)
                    break
                except subprocess.CalledProcessError:
                    if attempt == 89:
                        raise
                    time.sleep(1)
            for schema in [
                "001-init-v3-schema.sql.template",
                "002-logs-table.sql.template",
            ]:
                dc(
                    *sql,
                    input=(ROOT / "clickhouse-init" / schema).read_text(),
                    stdout=log,
                    stderr=log,
                )
        dc("up", "-d", stdout=log, stderr=log)
        # Retry readiness only, never scenario operations or failed assertions.
        probe = "import requests; s=requests.Session(); s.trust_env=False; assert all(s.get('http://api-'+n+'/openapi.json', timeout=2).status_code==200 for n in ['a','b'])"
        for attempt in range(90):
            try:
                dc(
                    "exec",
                    "-T",
                    "api-b",
                    "/web10/.venv/bin/python",
                    "-c",
                    probe,
                    stdout=log,
                    stderr=log,
                )
                break
            except subprocess.CalledProcessError:
                if attempt == 89:
                    raise
                time.sleep(1)
        result = subprocess.run(
            compose + ["exec", "-T", "api-b", "/web10/.venv/bin/python", "/demo/scenario.py"],
            text=True,
            capture_output=True,
        )
        (OUT / "scenario.json").write_text(result.stdout)
        (OUT / "scenario.stderr").write_text(result.stderr)
        assert result.returncode == 0, "scenario failed; see retained scenario.stderr"
        receipt = dc("exec", "-T", "tls-a", "cat", "/tmp/certify.log", capture_output=True).stdout
        (OUT / "issuer-calls.txt").write_text(receipt)
        assert receipt.splitlines() == ["POST /certify 200", "POST /certify 401"], (
            "expected one positive certification and one negatively cached forgery"
        )
        status["result"] = "passed"
    finally:
        # Do not dump API logs/inspect environment or preserve synthetic keys.
        try:
            ids = dc("ps", "-aq", capture_output=True).stdout.split()
            with (
                (OUT / "containers.txt").open("w") as record,
                (OUT / "images.txt").open("w") as images,
            ):
                for container in ids:
                    run(
                        docker
                        + [
                            "inspect",
                            "--format",
                            "{{.Name}} image={{.Image}} status={{.State.Status}} oom={{.State.OOMKilled}} ports={{json .NetworkSettings.Ports}}",
                            container,
                        ],
                        stdout=record,
                    )
                    image = run(
                        docker + ["inspect", "--format", "{{.Image}}", container],
                        capture_output=True,
                    ).stdout.strip()
                    run(
                        docker
                        + [
                            "image",
                            "inspect",
                            "--format",
                            "{{.Id}} digests={{json .RepoDigests}} created={{.Created}}",
                            image,
                        ],
                        stdout=images,
                    )
        except BaseException as error:
            # Diagnostics must never prevent project-scoped teardown.
            status.update(result="failed", diagnostics_error=type(error).__name__)
        down = subprocess.run(compose + ["down", "--volumes", "--remove-orphans"], stdout=log, stderr=log)
        subprocess.run(docker + ["image", "rm", IMAGE], stdout=log, stderr=log)
        cleanup = {"compose_down": down.returncode == 0}
        for kind, command in {
            "containers": ["ps", "-aq"],
            "networks": ["network", "ls", "-q"],
            "volumes": ["volume", "ls", "-q"],
        }.items():
            remaining = subprocess.run(
                docker + command + ["--filter", f"label=com.docker.compose.project={PROJECT}"],
                text=True,
                capture_output=True,
            )
            cleanup[kind] = remaining.returncode == 0 and not remaining.stdout.strip()
        remaining = subprocess.run(
            docker + ["image", "ls", "-q", "--filter", f"reference={IMAGE}"],
            text=True,
            capture_output=True,
        )
        cleanup["image_tag"] = remaining.returncode == 0 and not remaining.stdout.strip()
        status["cleanup_details"] = cleanup
        status["cleanup"] = all(cleanup.values())
        (OUT / "status.json").write_text(json.dumps(status))
        print(f"Evidence: {OUT} ({status})", flush=True)
status["private_material_removed"] = not private.exists()
(OUT / "status.json").write_text(json.dumps(status))
assert status["cleanup"] and status["result"] == "passed"
