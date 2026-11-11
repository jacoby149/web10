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
import re
import shutil
import threading
import time

from realism_contract import contract, sha


def run(repo, floor_receipts=None, refresh_floors=None, reference_floor_prefix=None, resume=False, skip_floor_gates=False):
    repo=Path(repo).resolve()
    if refresh_floors is not None and not re.fullmatch(r'[a-z0-9-]{1,40}',refresh_floors):
        raise ValueError('fresh floor attempt needs a bounded path-safe identifier')
    if reference_floor_prefix is not None and not re.fullmatch(r'[a-z0-9-]{1,40}',reference_floor_prefix):
        raise ValueError('reference floor prefix needs a bounded path-safe identifier')
    if resume and refresh_floors:
        raise ValueError('resume uses existing verified floor receipts; do not regenerate floors')
    if skip_floor_gates and (refresh_floors or reference_floor_prefix or floor_receipts):
        raise ValueError('direct floor skip cannot refresh or claim prerequisite floor receipts/references')
    output=repo/".context/realism-1m-prep"
    status_path=repo/".context/cloud-status.json"
    result_path=repo/".context/cloud-validation.json"
    status={"phase":"starting","pid":os.getpid(),"started_epoch":time.time(),
            "accounts":1000000,"readers":20000,"validation_complete":False,
            "minio_staged":False,"spaces_staged":False,"floor_gates_skipped":skip_floor_gates,
            "scope":"Private synthetic dataset preparation; no study/capacity/production claim",
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
        from realism_validate import validate,verify_floor_receipts
        here=Path(__file__).resolve().parent
        with lock:
            status["sources"]={name:sha(here/name) for name in ("realism_contract.py","realism_dataset.py","realism_validate.py","realism_cloud_worker.py")}
        floors=[] if skip_floor_gates else (list(floor_receipts) if floor_receipts else [here/"evidence/realism-10k-20261111-v4.json",here/"evidence/realism-100k-20261111-v4.json"])
        if skip_floor_gates:
            print('[cloud-prep] OPERATOR SKIP: no repeated floor/parity prerequisites; direct 1M generation, final validation retained',flush=True)
        if refresh_floors:
            floors=[]
            for n,label,old in ((10000,'10k','realism-10k-r7'),(100000,'100k','realism-100k-r1')):
                with lock:
                    status['phase']='generating-'+label+'-source-refresh'
                save()
                path=repo/'.context'/f'{refresh_floors}-{label}'
                checked=repo/'.context'/f'{refresh_floors}-{label}-validation.json'
                fresh=build(path,contract(n))
                old_folder=f'{reference_floor_prefix}-{label}' if reference_floor_prefix else old
                reference=json.loads((repo/'.context'/old_folder/'manifest.json').read_bytes())
                if fresh['files']!=reference['files']:
                    raise ValueError('fresh floor data bytes differ from preserved reference; stop before 1M')
                with lock:
                    status['phase']='validating-'+label+'-source-refresh'
                save()
                floor=validate(path,checked)
                if not floor['complete']:
                    raise ValueError('fresh independent floor gate failed; no 1M build')
                floors.append(checked)
                with lock:
                    status.setdefault('source_refresh_floors',{})[label]={'complete':True,'dataset_id':fresh['dataset_id'],
                                                                       'data_bytes_unchanged':True}
                save()
        with lock:
            status["phase"]="generating"
        save()
        print("[cloud-prep] phase=generating accounts=1000000 readers=20000",flush=True)
        spec=contract(1000000)
        manifest=None
        if resume:
            from realism_resume import generation
            with lock:
                status['phase']='reverifying-completed-generation'
            save()
            print('[cloud-prep] resume reverify floors and completed generation',flush=True)
            if not skip_floor_gates:
                verify_floor_receipts(floors,spec)
            manifest=generation(output,spec,floors,skip_floor_gates=True) if skip_floor_gates else generation(output,spec,floors)
        if manifest is None:
            manifest=build(output,spec,floors,skip_floor_gates=True) if skip_floor_gates else build(output,spec,floors)
        else:
            with lock:
                status['reused_verified_generation']=True
        with lock:
            status["dataset_id"]=manifest["dataset_id"]
            status["tables"]={k:{"rows":v["rows"],"bytes":v["bytes"]} for k,v in manifest["files"].items()}
            status["phase"]="validating"
        save()
        print("[cloud-prep] phase=validating dataset="+manifest["dataset_id"],flush=True)
        result=None
        if resume:
            from realism_resume import validation
            result=validation(result_path,output,manifest)
        if result is None:
            result=validate(output,result_path)
        else:
            with lock:
                status['reused_verified_validation']=True
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
    parser.add_argument('--floor-receipt',type=Path,action='append')
    parser.add_argument('--refresh-floors',help='Fresh source-bound floors with preserved-reference byte parity, before 1M')
    parser.add_argument('--reference-floor-prefix',help='Preserved same-runtime reference folders under repo/.context')
    parser.add_argument('--resume',action='store_true',help='Reverify/reuse completed stages; preserve and refuse partial/stale data')
    parser.add_argument('--skip-floor-gates',action='store_true',help='Operator opt-in: direct 1M without prerequisite floors/parity; records waiver, keeps final validation/resource controls')
    args=parser.parse_args()
    raise SystemExit(run(args.repo,args.floor_receipt,args.refresh_floors,args.reference_floor_prefix,args.resume,args.skip_floor_gates))
