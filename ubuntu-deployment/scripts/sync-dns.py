#!/usr/bin/env python3
"""Idempotently sync Cloudflare A records for both environments.

  dev  vhosts  -> VM_IP        (LAN; resolves publicly, routes nowhere off-VPN)
  prod vhosts  -> VM_PUBLIC_IP (public)

Reads CF_API_TOKEN / CF_ZONE / VM_IP / VM_PUBLIC_IP from ../.env.
Never touches MX/TXT/other records. Run from anywhere on the box:
  python3 ubuntu-deployment/scripts/sync-dns.py [--prune-staging]

--prune-staging also deletes the legacy staging.* A records.
This script is the record of the DNS layout — edit HOSTS here, re-run.
"""
import json, os, sys, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.join(HERE, "..", ".env")
cfg = {}
for line in open(ENV):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        cfg[k] = v

TOKEN = cfg["CF_API_TOKEN"]; ZONE = cfg["CF_ZONE"]
LAN = cfg["VM_IP"]; PUB = cfg["VM_PUBLIC_IP"]
H = {"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"}

# service subdomains, shared by both envs
SERVICES = ["", "auth.", "rtc.", "minio.", "social.", "www.", "marketing-api."]
# dev uses api-host "dev", prod uses "api" + the apex; see README URL map
DEV = {f"{s}dev.{ZONE}": LAN for s in SERVICES}
PROD = {f"{'api' if s=='' else s.rstrip('.')}.{ZONE}": PUB for s in SERVICES if s}
PROD[f"api.{ZONE}"] = PUB
PROD[ZONE] = PUB
WANT = {**DEV, **PROD}


def api(method, path, data=None):
    req = urllib.request.Request("https://api.cloudflare.com/client/v4" + path,
        data=json.dumps(data).encode() if data else None, headers=H, method=method)
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


def main():
    zid = api("GET", f"/zones?name={ZONE}")["result"][0]["id"]
    existing, page = {}, 1
    while True:
        r = api("GET", f"/zones/{zid}/dns_records?type=A&per_page=100&page={page}")
        for rec in r["result"]:
            existing[rec["name"]] = rec
        if page >= r["result_info"]["total_pages"]:
            break
        page += 1

    for name, ip in sorted(WANT.items()):
        body = {"type": "A", "name": name, "content": ip, "proxied": False, "ttl": 300}
        rec = existing.get(name)
        if rec and rec["content"] == ip and not rec["proxied"]:
            print("ok      ", name); continue
        if rec:
            api("PUT", f"/zones/{zid}/dns_records/{rec['id']}", body)
            print("updated ", name, "->", ip)
        else:
            api("POST", f"/zones/{zid}/dns_records", body)
            print("created ", name, "->", ip)

    if "--prune-staging" in sys.argv:
        for s in ["staging", "auth.staging", "rtc.staging", "minio.staging"]:
            name = f"{s}.{ZONE}"
            rec = existing.get(name)
            if rec:
                api("DELETE", f"/zones/{zid}/dns_records/{rec['id']}")
                print("pruned  ", name)


if __name__ == "__main__":
    main()
