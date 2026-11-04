"""Test-only extension of the isolated federation runner."""

import json
import os
import secrets
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
CASES = [
    {
        "domain": f"creator-{size}.alias.test",
        "a": f"creator-old-{size}",
        "b": f"creator-new-{size}",
        "reader": f"fan-{size}",
    }
    for size in ("desktop", "mobile")
]


def configure(services, private, image, root):
    control = secrets.token_urlsafe(32)
    (private / "domain-control").write_text(control)
    (private / "client-config.json").write_text(json.dumps({"cases": CASES, "providers": {}, "home": ""}))
    for node in ("a", "b"):
        services[f"api-{node}"]["dns"] = ["11.252.77.12"]
        services[f"api-{node}"]["volumes"].extend(
            [f"{HERE}:/domain:ro", f"{private / 'client-config.json'}:/domain-config.json:ro"]
        )
        services[f"tls-{node}"]["ports"] = ["127.0.0.1::443"]
        services[f"tls-{node}"]["networks"]["browser"] = {}
    services["domain-dns"] = {
        "image": image,
        "command": ["/web10/.venv/bin/python", "/domain/dns_fixture.py"],
        "environment": {"DNS_CONTROL_TOKEN": control},
        "volumes": [
            f"{HERE}:/domain:ro",
            f"{private / 'client-config.json'}:/domain-config.json:ro",
            f"{root / 'marketing/marketing-ui/public'}:/assets:ro",
        ],
        "ports": ["127.0.0.1::8080"],
        "networks": {"lab": {"ipv4_address": "11.252.77.12"}, "browser": {}},
    }


def execute(dc, docker, private, out, root):
    def port(service, value):
        address = dc("port", service, str(value), capture_output=True).stdout.strip()
        assert address.startswith("127.0.0.1:"), "Only loopback ports may be published"
        return address

    app = "http://" + port("domain-dns", 8080)
    providers = {f"node-{n}.federation.test": "https://" + port(f"tls-{n}", 443) for n in ("a", "b")}
    config = {"cases": CASES, "providers": providers, "home": providers["node-b.federation.test"], "origin": app}
    history = []

    def publish_config(stage):
        history.append({"stage": stage, "config": json.loads(json.dumps(config))})
        (private / "client-config.json").write_text(json.dumps(config))
        (out / "client-config.json").write_text(json.dumps(config))
        (out / "client-config-history.json").write_text(json.dumps(history))

    publish_config("initial")
    for attempt in range(40):
        try:
            with urlopen(app + "/config.json", timeout=1) as response:
                assert response.status == 200
            break
        except (URLError, TimeoutError):
            if attempt == 39:
                raise
            time.sleep(0.5)
    seed = dc("exec", "-T", "api-b", "/web10/.venv/bin/python", "/domain/seed.py", capture_output=True)
    (out / "seed.txt").write_text(seed.stdout)
    env = {
        **os.environ,
        "DOMAIN_DEMO_ORIGIN": app,
        "DOMAIN_DEMO_CONTROL": (private / "domain-control").read_text(),
        "DOMAIN_DEMO_BARRIER": str(private),
        "DOMAIN_DEMO_OUT": str(out),
    }
    with (out / "scenario.json").open("w") as stdout, (out / "scenario.stderr").open("w") as stderr:
        child = subprocess.Popen(["node", str(HERE / "browser.mjs")], cwd=root, env=env, stdout=stdout, stderr=stderr)
        started = time.monotonic()
        try:
            while child.poll() is None:
                if time.monotonic() - started > 240:
                    raise TimeoutError("Browser scenario exceeded its deadline")
                for step in ("stop", "restore"):
                    request = private / f"{step}-a.request"
                    if request.exists():
                        request.unlink()
                        dc(step if step == "stop" else "start", "api-a", "tls-a", capture_output=True)
                        if step == "restore":
                            for attempt in range(40):
                                probe = subprocess.run(
                                    docker
                                    + [
                                        "exec",
                                        dc("ps", "-q", "api-a", capture_output=True).stdout.strip(),
                                        "/web10/.venv/bin/python",
                                        "-c",
                                        "import requests; assert requests.get('http://localhost/openapi.json',timeout=2).status_code==200",
                                    ],
                                    capture_output=True,
                                )
                                if probe.returncode == 0:
                                    break
                                if attempt == 39:
                                    raise RuntimeError("Restored node did not become ready")
                                time.sleep(0.5)
                            config["providers"]["node-a.federation.test"] = "https://" + port("tls-a", 443)
                            publish_config("restore-a")
                        (private / f"{step}-a.ack").write_text("done")
                time.sleep(0.1)
            assert child.returncode == 0, "Domain browser scenario failed; see retained scenario.stderr"
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
    result = json.loads((out / "scenario.json").read_text())
    assert result["result"] == "passed" and len(result["cases"]) == 2
