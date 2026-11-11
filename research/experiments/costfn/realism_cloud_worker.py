"""Private preparation worker: pinned 1M generation/validation, not a load study.

No DO/MinIO credentials, publication, API server or production access. A separate
controller collects status and stages validated artifacts under operator approval.
"""
import argparse
import json
import os
from pathlib import Path
import platform
import resource
import shutil
import threading
import time

from realism_contract import contract, sha


def run(repo):
    repo=Path(repo).resolve()
    output=repo/".context/realism-1m-prep"
    status_path=repo/".context/cloud-status.json"
    result_path=repo/".context/cloud-validation.json"
    status={"phase":"starting","pid":os.getpid(),"started_epoch":time.time(),
            "accounts":1000000,"readers":20000,"validation_complete":False,
            "minio_staged":False,"scope":"Private synthetic dataset preparation; no study/capacity/production claim",
            "runtime":{"python":platform.python_version(),"architecture":platform.machine(),"cpus":os.cpu_count()}}
    lock=threading.RLock()
    stopped=threading.Event()

    def save():
        with lock:
            disk=shutil.disk_usage(repo)
            status.update({"updated_epoch":time.time(),"free_bytes":disk.free,
                           "process_maxrss_bytes":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,
                           "load":os.getloadavg()})
            tmp=status_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(status,indent=2)+"\n")
            tmp.replace(status_path)

    def heartbeat():
        while not stopped.wait(10):
            save()

    save()
    thread=threading.Thread(target=heartbeat,daemon=True)
    thread.start()
    try:
        from realism_dataset import build
        from realism_validate import validate
        here=Path(__file__).resolve().parent
        with lock:
            status["sources"]={name:sha(here/name) for name in ("realism_contract.py","realism_dataset.py","realism_validate.py","realism_cloud_worker.py")}
            status["phase"]="generating"
        save()
        print("[cloud-prep] phase=generating accounts=1000000 readers=20000",flush=True)
        floors=[here/"evidence/realism-10k-20261111-v4.json",here/"evidence/realism-100k-20261111-v4.json"]
        manifest=build(output,contract(1000000),floors)
        with lock:
            status["dataset_id"]=manifest["dataset_id"]
            status["tables"]={k:{"rows":v["rows"],"bytes":v["bytes"]} for k,v in manifest["files"].items()}
            status["phase"]="validating"
        save()
        print("[cloud-prep] phase=validating dataset="+manifest["dataset_id"],flush=True)
        result=validate(output,result_path)
        with lock:
            status["validation_complete"]=result["complete"]
            status["checks_passed"]=sum(v is True for v in result["checks"].values())
            status["checks_total"]=len(result["checks"])
            status["phase"]="validated-awaiting-private-staging" if result["complete"] else "validation-failed"
        save()
        if not result["complete"]:
            return 1
        return 0
    except Exception as error:
        with lock:
            status["phase"]="failed"
            status["error_type"]=type(error).__name__
            status["diagnostic"]=str(error)[:500]
        save()
        raise
    finally:
        stopped.set()
        thread.join(timeout=15)
        save()


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo",type=Path,required=True)
    args=parser.parse_args()
    raise SystemExit(run(args.repo))
