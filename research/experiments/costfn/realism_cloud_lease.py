"""One-run DigitalOcean lease/cleanup watchdog. No provider credential export.

Run from launchd independently of the worker, SSH connection and coding session.
Mac/network/provider loss is NOT a provider-enforced billing guarantee.
"""
import argparse
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time

DOCTL = "/opt/homebrew/bin/doctl"


def api(*args):
    env={"HOME":str(Path.home()),"PATH":"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"}
    result=subprocess.run([DOCTL,"--http-retry-max","1","--output","json",*args],
                          env=env,capture_output=True,text=True,timeout=90)
    if result.returncode:
        raise RuntimeError("DigitalOcean operation failed: "+" ".join(args[:3]))
    return json.loads(result.stdout) if result.stdout.strip() else None


def validate(lease):
    if not re.fullmatch(r"[a-f0-9]{12}",lease["run_id"]):
        raise ValueError("invalid run ID")
    expected="web10-realism-prep-"+lease["run_id"]
    if lease["name"]!=expected or lease["tag"]!=expected or lease["size"]!="s-8vcpu-32gb-amd":
        raise ValueError("exact run ownership and approved SKU required")
    if not 0 < lease["deadline"]-lease["created_epoch"] <= 4*3600:
        raise ValueError("four-hour maximum lease required")
    if lease["max_usd"]!=5:
        raise ValueError("approved budget target required")
    if not lease.get("account_uuid"):
        raise ValueError("cloud account identity must be pinned")


def assert_account(lease):
    row=api("account","get")
    row=row[0] if isinstance(row,list) and row else row
    if not isinstance(row,dict) or row.get("uuid")!=lease["account_uuid"]:
        raise ValueError("DigitalOcean account changed; refusing misleading cleanup")


@contextmanager
def locked(path):
    path=Path(path)
    with path.with_suffix(".lock").open("a") as guard:
        fcntl.flock(guard,fcntl.LOCK_EX)
        lease=json.loads(path.read_bytes())
        validate(lease)
        try:
            yield lease
        finally:
            temporary=path.with_suffix(".tmp")
            fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
            with os.fdopen(fd,"w") as output:
                json.dump(lease,output,indent=2)
                output.write("\n")
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary,path)


def admits_creation(lease,now=None):
    validate(lease)
    now=time.time() if now is None else now
    if lease.get("cancelled") or lease.get("cleanup_verified") or now>=lease["deadline"]:
        raise ValueError("lease irreversibly closed to creation")


def owned_droplet(row,lease):
    sku=row.get("size_slug") or row.get("size",{}).get("slug")
    return (row.get("name")==lease["name"] and lease["tag"] in row.get("tags",[])
            and sku==lease["size"] and (not lease.get("droplet_id") or row.get("id")==lease["droplet_id"]))


def owned_firewall(row,lease):
    return (row.get("name")==lease["name"] and row.get("tags")==[lease["tag"]]
            and (not lease.get("firewall_id") or row.get("id")==lease["firewall_id"]))


def owned_key(row,lease):
    return (row.get("name")==lease["name"] and row.get("fingerprint")==lease.get("key_fingerprint")
            and (not lease.get("ssh_key_id") or row.get("id")==lease["ssh_key_id"]))


def cleanup(lease):
    # Called while holding the same lock as every create call: no check/create
    # gap can resurrect work after cancellation. Unknown API outcomes remain
    # armed, never reported empty/complete just because one listing is empty.
    lease["cancelled"]=True
    lease["phase"]="cleanup"
    assert_account(lease)
    # Pin known IDs as well as discovery tags. A removed tag must not make a
    # still-billed known host disappear from cleanup verification.
    all_droplets=api("compute","droplet","list") or []
    droplets=[r for r in all_droplets if r.get("id")==lease.get("droplet_id")
              or lease["tag"] in r.get("tags",[])]
    for row in droplets:
        if not owned_droplet(row,lease):
            raise ValueError("ownership mismatch: refuse broad cleanup")
        api("compute","droplet","delete",str(row["id"]),"--force")
    remaining=[r for r in api("compute","droplet","list") or []
               if r.get("id")==lease.get("droplet_id") or lease["tag"] in r.get("tags",[])]
    if remaining:
        lease["cleanup_pending"]="droplet removal readback"
        return
    for row in api("compute","firewall","list") or []:
        if row.get("id")==lease.get("firewall_id") and not owned_firewall(row,lease):
            raise ValueError("known firewall ownership changed; refuse false cleanup")
        if owned_firewall(row,lease):
            api("compute","firewall","delete",row["id"],"--force")
    for row in api("compute","ssh-key","list") or []:
        if row.get("id")==lease.get("ssh_key_id") and not owned_key(row,lease):
            raise ValueError("known key ownership changed; refuse false cleanup")
        if owned_key(row,lease):
            api("compute","ssh-key","delete",str(row["id"]),"--force")
    firewalls=api("compute","firewall","list") or []
    keys=api("compute","ssh-key","list") or []
    if (any(r.get("id")==lease.get("firewall_id") or owned_firewall(r,lease) for r in firewalls)
            or any(r.get("id")==lease.get("ssh_key_id") or owned_key(r,lease) for r in keys)):
        lease["cleanup_pending"]="auxiliary removal readback"
        return
    if lease.get("creation_uncertain") or not lease.get("creation_complete"):
        lease["cleanup_pending"]="uncertain creation; watchdog stays armed"
        return
    # Exact resource absence is checked above; leave the unique tag as a
    # harmless selector until normal controller reconciliation removes it.
    lease["cleanup_verified"]=True
    lease["cleanup_verified_epoch"]=time.time()
    lease["phase"]="deleted"
    lease.pop("cleanup_pending",None)


def tick(path,stop=False):
    with locked(path) as lease:
        lease["watchdog_last_seen_epoch"]=time.time()
        if lease.get("cleanup_verified"):
            return
        if not lease.get("watchdog_api_verified_epoch"):
            try:
                assert_account(lease)
                api("compute","droplet","list","--tag-name",lease["tag"])
                lease["watchdog_api_verified_epoch"]=time.time()
            except Exception as error:
                lease["watchdog_error"]={"type":type(error).__name__,"at":time.time()}
                return
        if stop or lease.get("cancelled") or time.time()>=lease["deadline"]:
            try:
                cleanup(lease)
                lease.pop("watchdog_error",None)
            except Exception as error:
                lease["watchdog_error"]={"type":type(error).__name__,"at":time.time()}
                # Cancellation must still persist. Next launchd tick retries.


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lease",type=Path,required=True)
    parser.add_argument("--stop",action="store_true")
    args=parser.parse_args()
    tick(args.lease,args.stop)
