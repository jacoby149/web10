#!/usr/bin/env python3
"""Create or update the Portainer git-backed stacks (edge, dev, prod).

Each stack tracks the `dev` branch of the repo and auto-updates every
5 minutes (GitOps polling — E6 phase 1). Re-running is safe: an
existing stack is updated in place, a missing one is created.

  python3 ubuntu-deployment/scripts/deploy-stacks.py [edge|dev|prod|all]

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
                 CORS_SERVICE_MANAGERS="auth.dev.web10.app,social.dev.web10.app,www.dev.web10.app",
                 MINIO_PASSWORD=cfg["MINIO_PASSWORD_DEV"])
    else:
        d = dict(STACK="web10-prod", PROVIDER="api.web10.app",
                 API_ORIGIN="https://api.web10.app", API_HOST="api.web10.app",
                 AUTH_ORIGIN="https://auth.web10.app", RTC_ORIGIN="https://rtc.web10.app",
                 MINIO_HOST="minio.web10.app", MARKETING_API_ORIGIN="https://marketing-api.web10.app",
                 CORS_SERVICE_MANAGERS="auth.web10.app,social.web10.app,www.web10.app,web10.app",
                 MINIO_PASSWORD=cfg["MINIO_PASSWORD_PROD"])
    return [{"name": k, "value": v} for k, v in d.items()]


def deploy(name, compose, env):
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


targets = sys.argv[1] if len(sys.argv) > 1 else "all"
if targets in ("edge", "all"):
    deploy("edge", EDGE_COMPOSE, [])
if targets in ("dev", "all"):
    deploy("web10-dev", COMPOSE, env_for("web10-dev"))
if targets in ("prod", "all"):
    deploy("web10-prod", COMPOSE, env_for("web10-prod"))
