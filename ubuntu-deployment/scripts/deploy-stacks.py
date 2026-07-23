#!/usr/bin/env python3
"""Create, update, or register Portainer stacks.

Two modes:

  FILE-BACKED (default, no GitOps polling):
    Stack is registered in Portainer pointing at a local compose file.
    Portainer provides the management UI (restart, logs, env-var editor)
    but does NOT auto-pull or auto-deploy. GitHub Actions handles deploys
    via SSH → docker compose. This is the E6 replacement for GitOps.

    python3 scripts/deploy-stacks.py register dev
    python3 scripts/deploy-stacks.py register prod
    python3 scripts/deploy-stacks.py register all

  GIT-BACKED (legacy, GitOps polling — deprecated):
    Stack tracks a git ref and auto-updates every 5 minutes.
    DO NOT USE — the retry loop is brittle and invisible to GitHub.

    python3 scripts/deploy-stacks.py gitops dev
    python3 scripts/deploy-stacks.py gitops all

  DISABLE GITOPS (convert existing git-backed stacks):
    Removes autoUpdate from an existing git-backed stack in place.

    python3 scripts/deploy-stacks.py disable-gitops dev
    python3 scripts/deploy-stacks.py disable-gitops all

Secrets (Portainer creds, MINIO passwords) come from ../.env. The
per-stack environment is defined HERE — this file is the source of
truth for what each env's vars are. No secret is written to the repo.
"""
import json, os, sys, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = {}
for line in open(os.path.join(HERE, "..", ".env")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); cfg[k] = v

P = "http://localhost:9000/api"
REPO = "https://github.com/jacoby149/web10"
REF = "refs/heads/dev"
COMPOSE = "ubuntu-deployment/docker-compose.ecosystem.yml"
EDGE_COMPOSE = "ubuntu-deployment/docker-compose.edge.yml"
COMPOSE_PATH = "/opt/web10/ubuntu-deployment/docker-compose.ecosystem.yml"
EDGE_COMPOSE_PATH = "/opt/web10/ubuntu-deployment/docker-compose.edge.yml"


def jwt():
    r = urllib.request.urlopen(urllib.request.Request(P + "/auth",
        data=json.dumps({"username": cfg["PORTAINER_USER"], "password": cfg["PORTAINER_PASSWORD"]}).encode(),
        headers={"Content-Type": "application/json"}, method="POST"))
    return json.load(r)["jwt"]


H = {"Authorization": "Bearer " + jwt(), "Content-Type": "application/json"}


def api(method, path, data=None):
    req = urllib.request.Request(P + path,
        data=json.dumps(data).encode() if data is not None else None, headers=H, method=method)
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        return {"_err": e.code, "_body": e.read().decode()[:300]}


def env_for(stack):
    if stack == "web10-dev":
        d = dict(STACK="web10-dev", PROVIDER="api.dev.web10.app",
                 API_ORIGIN="https://api.dev.web10.app", API_HOST="api.dev.web10.app",
                 AUTH_ORIGIN="https://auth.dev.web10.app", RTC_ORIGIN="https://rtc.dev.web10.app",
                 MINIO_HOST="minio.dev.web10.app", MARKETING_API_ORIGIN="https://marketing-api.dev.web10.app",
                 CORS_SERVICE_MANAGERS="auth.dev.web10.app",
                 MINIO_PASSWORD=cfg["MINIO_PASSWORD_DEV"])
    else:
        d = dict(STACK="web10-prod", PROVIDER="api.web10.app",
                 DB="deploy", DB_URL="mongodb://host.docker.internal:27017/",
                 API_ORIGIN="https://api.web10.app", API_HOST="api.web10.app",
                 AUTH_ORIGIN="https://auth.web10.app", RTC_ORIGIN="https://rtc.web10.app",
                 MINIO_HOST="minio.web10.app", MARKETING_API_ORIGIN="https://marketing-api.web10.app",
                 CORS_SERVICE_MANAGERS="auth.web10.app",
                 MINIO_PASSWORD=cfg["MINIO_PASSWORD_PROD"])
    return [{"name": k, "value": v} for k, v in d.items()]


def find_stack(name):
    stacks = api("GET", "/stacks")
    if not isinstance(stacks, list):
        return None
    return next((s for s in stacks if s["Name"] == name), None)


# ---------------------------------------------------------------------------
# FILE-BACKED (register) — no GitOps polling
# ---------------------------------------------------------------------------
def register_file_backed(name, compose_path, env):
    """Register a file-backed stack in Portainer (no auto-update).

    If the stack already exists (git-backed or file-backed), it gets
    deleted and recreated. Portainer doesn't support converting a
    git-backed stack to file-backed in-place.
    """
    found = find_stack(name)
    if found:
        # Delete existing stack (Portainer won't let us change type)
        print(f"removing existing stack '{name}' (id={found['Id']}) for re-registration...")
        r = api("DELETE", f"/stacks/{found['Id']}?endpointId=1")
        if "_err" in r:
            print(f"  WARNING: could not delete existing stack: {r}")
            print(f"  Skipping '{name}' — delete it manually in Portainer first.")
            return

    body = {
        "name": name,
        "stackFile": compose_path,
        "env": env,
    }
    r = api("POST", "/stacks/create/standalone/file?endpointId=1", body)
    if "_err" in r:
        print(f"FAIL registering '{name}': {r}")
    else:
        print(f"registered {name} (file-backed, id={r.get('Id', '?')})")


# ---------------------------------------------------------------------------
# GIT-BACKED (legacy, deprecated)
# ---------------------------------------------------------------------------
def deploy_gitops(name, compose, env):
    """Legacy git-backed stack with 5-min polling. DEPRECATED."""
    stacks = api("GET", "/stacks")
    found = next((s for s in stacks if s["Name"] == name), None) if isinstance(stacks, list) else None
    if found:
        body = {"env": env, "prune": False, "pullImage": True,
                "repositoryReferenceName": REF, "repositoryAuthentication": False}
        r = api("PUT", f"/stacks/{found['Id']}/git/redeploy?endpointId=1", body)
        print(f"updated  {name}:", r.get("Id", r.get("_body", "")))
    else:
        body = {"name": name, "repositoryURL": REPO, "repositoryReferenceName": REF,
                "composeFile": compose, "env": env, "autoUpdate": {"interval": "5m"}}
        r = api("POST", "/stacks/create/standalone/repository?endpointId=1", body)
        print(f"created  {name}:", r.get("Id", r.get("_body", "")))


# ---------------------------------------------------------------------------
# DISABLE GITOPS — remove autoUpdate from existing git-backed stacks
# ---------------------------------------------------------------------------
def disable_gitops(name):
    """Disable auto-update on an existing git-backed stack."""
    found = find_stack(name)
    if not found:
        print(f"stack '{name}' not found")
        return
    # Get current stack config
    r = api("GET", f"/stacks/{found['Id']}")
    if "_err" in r:
        print(f"FAIL reading stack '{name}': {r}")
        return

    # Remove autoUpdate
    r.pop("autoUpdate", None)
    if "Config" in r and isinstance(r["Config"], dict):
        r["Config"].pop("autoUpdate", None)

    updated = api("PUT", f"/stacks/{found['Id']}", r)
    if "_err" in updated:
        print(f"FAIL disabling gitops on '{name}': {updated}")
    else:
        print(f"disabled gitops on '{name}' (id={found['Id']})")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if len(sys.argv) < 2:
    print(__doc__)
    sys.exit(1)

mode = sys.argv[1]
targets = sys.argv[2] if len(sys.argv) > 2 else "all"

if mode == "register":
    if targets in ("edge", "all"):
        register_file_backed("edge", EDGE_COMPOSE_PATH, [])
    if targets in ("dev", "all"):
        register_file_backed("web10-dev", COMPOSE_PATH, env_for("web10-dev"))
    if targets in ("prod", "all"):
        register_file_backed("web10-prod", COMPOSE_PATH, env_for("web10-prod"))

elif mode == "gitops":
    print("WARNING: gitops mode is deprecated — use 'register' for file-backed stacks")
    if targets in ("edge", "all"):
        deploy_gitops("edge", EDGE_COMPOSE, [])
    if targets in ("dev", "all"):
        deploy_gitops("web10-dev", COMPOSE, env_for("web10-dev"))
    if targets in ("prod", "all"):
        deploy_gitops("web10-prod", COMPOSE, env_for("web10-prod"))

elif mode == "disable-gitops":
    if targets in ("edge", "all"):
        disable_gitops("edge")
    if targets in ("dev", "all"):
        disable_gitops("web10-dev")
    if targets in ("prod", "all"):
        disable_gitops("web10-prod")

else:
    print(f"Unknown mode: {mode}")
    print("Modes: register, gitops (deprecated), disable-gitops")
    sys.exit(1)