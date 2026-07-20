#!/usr/bin/env python3
"""Idempotently configure the NPM edge: one DNS-01 cert + all proxy hosts.

Reads NPM_USER / NPM_PASSWORD / CF_API_TOKEN from ../.env. Every proxy
host forwards by the STACK-PREFIXED ALIAS over the proxy network (never
a bare service name — bare names resolve ambiguously across stacks).
Re-running reconciles: missing hosts created, the cert reused.

  python3 ubuntu-deployment/scripts/sync-npm.py

The HOSTS table here is the source of truth for the reverse-proxy map.
"""
import json, os, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = {}
for line in open(os.path.join(HERE, "..", ".env")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); cfg[k] = v

NPM = "http://localhost:81/api"
CF = cfg["CF_API_TOKEN"]

# (vhost, forward alias, port). dev → web10-dev-*, prod → web10-prod-*.
HOSTS = []
for env, pre in (("dev", "web10-dev"), ("prod", "web10-prod")):
    suffix = ".dev.web10.app" if env == "dev" else ".web10.app"
    HOSTS += [
        (f"api{suffix}", f"{pre}-api", 80),
        (f"auth{suffix}", f"{pre}-ui", 80),
        (f"rtc{suffix}", f"{pre}-rtc", 80),
        (f"minio{suffix}", f"{pre}-minio", 9000),
        (f"social{suffix}", f"{pre}-social", 80),
        (f"www{suffix}", f"{pre}-marketing-ui", 80),
        (f"marketing-api{suffix}", f"{pre}-marketing-api", 80),
        (suffix.lstrip("."), f"{pre}-marketing-ui", 80),  # env apex → marketing
    ]
DOMAINS = [h[0] for h in HOSTS]


def token():
    r = urllib.request.urlopen(urllib.request.Request(NPM + "/tokens",
        data=json.dumps({"identity": cfg["NPM_USER"], "secret": cfg["NPM_PASSWORD"]}).encode(),
        headers={"Content-Type": "application/json"}, method="POST"))
    return json.load(r)["token"]


H = {"Authorization": "Bearer " + token(), "Content-Type": "application/json"}


def api(method, path, data=None):
    req = urllib.request.Request(NPM + path,
        data=json.dumps(data).encode() if data is not None else None, headers=H, method=method)
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        return {"_err": e.code, "_body": e.read().decode()[:200]}


# 1. one cert covering every vhost, via Cloudflare DNS-01
certs = api("GET", "/nginx/certificates")
cid = None
if isinstance(certs, list):
    for c in certs:
        if set(c.get("domain_names", [])) == set(DOMAINS):
            cid = c["id"]
if cid:
    print("cert exists:", cid)
else:
    r = api("POST", "/nginx/certificates", {
        "domain_names": DOMAINS, "provider": "letsencrypt",
        "meta": {"dns_challenge": True, "dns_provider": "cloudflare",
                 "dns_provider_credentials": "dns_cloudflare_api_token = " + CF,
                 "propagation_seconds": 30}})
    cid = r.get("id")
    print("cert created:", cid, r.get("_body", ""))

# 2. proxy hosts
existing = api("GET", "/nginx/proxy-hosts")
have = {}
if isinstance(existing, list):
    for h in existing:
        for d in h["domain_names"]:
            have[d] = h
for dom, fwd, port in HOSTS:
    base = {"domain_names": [dom], "forward_scheme": "http", "forward_host": fwd,
            "forward_port": port, "certificate_id": cid or 0, "ssl_forced": True,
            "http2_support": True, "hsts_enabled": True, "block_exploits": True,
            "caching_enabled": False, "allow_websocket_upgrade": True,
            "access_list_id": 0, "advanced_config": "", "locations": [], "meta": {}}
    if dom in have:
        r = api("PUT", f"/nginx/proxy-hosts/{have[dom]['id']}", base)
        print("updated ", dom, "->", f"{fwd}:{port}")
    else:
        r = api("POST", "/nginx/proxy-hosts", base)
        print("created ", dom, "->", f"{fwd}:{port}", r.get("_body", ""))
