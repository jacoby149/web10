"""Measure owned local generator/validator disk scratch without changing inputs.

The controller samples its own child and explicitly announced temporary paths.
Neither measurements nor extrapolations authorize 1M, uploads or paid work.
Generator/validator source files and the existing admission guard are untouched.
"""
import argparse
import json
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time

from realism_contract import sha

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
CONTEXT = REPO / ".context"
PREFIX = "REALISM_SCRATCH_EVENT="


def owned_path(value):
    path = Path(value).absolute()
    if path.is_symlink() or not path.resolve().is_relative_to(CONTEXT.resolve()):
        raise ValueError("scratch observer only accepts owned workspace-context paths")
    return path


def tree_bytes(roots):
    """No symlink traversal; nested roots and hard links are counted only once."""
    logical = allocated = 0
    seen = set()
    paths = sorted({Path(p) for p in roots}, key=lambda p: len(p.parts))
    minimal = [p for p in paths if not any(p != other and p.is_relative_to(other) for other in paths)]
    for root in minimal:
        pending = [root]
        while pending:
            path = pending.pop()
            try:
                info = path.lstat()
                if stat.S_ISLNK(info.st_mode):
                    continue
                if stat.S_ISDIR(info.st_mode):
                    pending.extend(path.iterdir())
                elif stat.S_ISREG(info.st_mode) and (info.st_dev, info.st_ino) not in seen:
                    seen.add((info.st_dev, info.st_ino))
                    logical += info.st_size
                    allocated += info.st_blocks * 512
            except FileNotFoundError:
                pass  # a spill/temporary file was removed between samples
    return {"logical_bytes": logical, "allocated_bytes": allocated}


def emit(kind, **values):
    print(PREFIX + json.dumps({"kind": kind, **values}), flush=True)


class ObservedDirectory:
    """Only observes tempfile ownership; original location/cleanup are retained."""
    def __init__(self, original, *args, **kwargs):
        self.original = original(*args, **kwargs)
        emit("created", path=self.original.name)

    def __enter__(self):
        return self.original.__enter__()

    def __exit__(self, *args):
        # Acknowledgement lets the observer sample before this directory is
        # removed. This does not freeze transient files removed inside a query.
        emit("before_cleanup", path=self.original.name)
        if sys.stdin.readline().strip() != "sampled":
            raise RuntimeError("scratch controller disconnected before cleanup sample")
        return self.original.__exit__(*args)


def child(mode, directory, reference, result_path):
    # Imports occur before observation; no runtime, memory, thread or SQL knobs
    # are patched. The only shim announces tempfile paths and cleanup boundaries.
    from realism_dataset import build
    from realism_validate import validate
    manifest = json.loads((reference / "manifest.json").read_bytes())
    original = tempfile.TemporaryDirectory
    tempfile.TemporaryDirectory = lambda *a, **k: ObservedDirectory(original, *a, **k)
    try:
        if mode == "generate":
            generated = build(directory, manifest["contract"])
            if generated != manifest:
                raise ValueError("audit generation differs from the source-matched reference manifest/bytes")
            result = {"complete": True, "dataset_id": generated["dataset_id"], "reference_identical": True}
        else:
            result = validate(directory, result_path)
        emit("result", complete=result["complete"], dataset_id=result["dataset_id"])
        if not result["complete"]:
            raise ValueError("audit validation failed; measurements are preparation-failure evidence")
    finally:
        tempfile.TemporaryDirectory = original


def measure(mode, directory, reference, audit, interval=1.0, reserve=8 * 1024**3, max_seconds=3600):
    roots = {owned_path(directory)}
    lock = threading.RLock()
    errors = []
    result = {}
    start = time.monotonic()
    free_before = shutil.disk_usage(CONTEXT).free
    peaks = {"logical_bytes": 0, "allocated_bytes": 0}
    source = audit / f"{mode}-samples.jsonl"
    log_path = audit / f"{mode}.log"
    command = [sys.executable, str(Path(__file__).resolve()), "child", mode,
               "--directory", str(directory), "--reference", str(reference), "--audit", str(audit)]
    with source.open("x") as samples, log_path.open("x") as log:
        def sample(reason):
            with lock:
                observed = tree_bytes(roots)
                for key in peaks:
                    peaks[key] = max(peaks[key], observed[key])
                free = shutil.disk_usage(CONTEXT).free
                samples.write(json.dumps({"elapsed_s":time.monotonic()-start,"reason":reason,
                                          "free_bytes":free,**observed})+"\n")
                samples.flush()
                return free

        process = subprocess.Popen(command, cwd=REPO, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, bufsize=1)

        def consume():
            try:
                for line in process.stdout:
                    log.write(line)
                    log.flush()
                    if not line.startswith(PREFIX):
                        continue
                    event = json.loads(line[len(PREFIX):])
                    if event["kind"] in ("created","before_cleanup"):
                        path = owned_path(event["path"])
                        if not path.name.startswith(("realism-work-","realism-validate-","realism-partitions-","realism-clickhouse-")):
                            raise ValueError("child announced an unexpected scratch directory")
                        with lock:
                            roots.add(path)
                        sample(event["kind"])
                        if event["kind"] == "before_cleanup":
                            process.stdin.write("sampled\n")
                            process.stdin.flush()
                    elif event["kind"] == "result":
                        result.update(event)
            except Exception as error:
                errors.append(f"{type(error).__name__}: {error}")

        reader = threading.Thread(target=consume, daemon=True)
        reader.start()
        stop = None
        try:
            while process.poll() is None:
                if sample("periodic") < reserve:
                    stop = "local_free_space_reserve"
                elif time.monotonic()-start > max_seconds:
                    stop = "local_measurement_wall_time_limit"
                elif errors:
                    stop = "observer_error"
                if stop:
                    process.terminate()  # only the child created by this controller
                    break
                try:
                    process.wait(timeout=interval)
                except subprocess.TimeoutExpired:
                    pass
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            reader.join(timeout=30)
            if reader.is_alive():
                errors.append("observer reader did not drain after child exit")
            sample("finished")
    return {"phase":mode,"returncode":process.returncode,"result":result,"observer_errors":errors,
            "stop_reason":stop,"elapsed_s":time.monotonic()-start,"sample_interval_s":interval,
            "free_bytes_before":free_before,"free_bytes_after":shutil.disk_usage(CONTEXT).free,
            "sampled_peak":peaks,"samples":source.name,"log":log_path.name,
            "complete":process.returncode==0 and result.get("complete") is True and not errors and not stop}


def run(reference, audit):
    reference, audit = owned_path(reference), owned_path(audit)
    manifest = json.loads((reference / "manifest.json").read_bytes())
    if manifest["recipe"]["accounts"] != 100000:
        raise ValueError("this audit is the existing 100k floor only, never a 1M admission bypass")
    if shutil.disk_usage(CONTEXT).free < 16 * 1024**3:
        raise ValueError("at least 16 GiB free required to begin the bounded 100k audit")
    pins = {p:sha(HERE/p) for p in ("realism_scratch.py","realism_dataset.py","realism_validate.py","realism_clickhouse.py","realism_contract.py")}
    audit.mkdir(exist_ok=False)
    record = {"kind":"REALISM_LOCAL_SCRATCH_AUDIT","recipe":manifest["recipe"],"reference_id":manifest["dataset_id"],
              "source_pins":pins,"phases":[],"paid_provisioning":False,"uploads":False,"million_admitted":False,
              "instrumentation":"tempfile ownership announcements, cleanup sample acknowledgements, external one-second scans; no SQL/runtime/allocation changes",
              "limits":"sampled file-data peaks omit directory metadata/short spikes and are observed lower bounds, not certified maxima; filesystem free-space changes can include unrelated work; floor has 16 readers vs 20000 at 1M"}
    dataset = audit / "dataset"
    for mode in ("generate","validate"):
        print(f"[scratch-audit] start {mode}; no cloud, 8 GiB free-space reserve",flush=True)
        phase = measure(mode,dataset,reference,audit)
        record["phases"].append(phase)
        record["sources_unchanged"] = pins == {p:sha(HERE/p) for p in pins}
        record["complete"] = (all(p["complete"] for p in record["phases"])
                              and len(record["phases"])==2 and record["sources_unchanged"])
        with (audit/f"{mode}-receipt.json").open("x") as handle:
            json.dump(record,handle,indent=2)
            handle.write("\n")
        print(f"[scratch-audit] {mode}: complete={phase['complete']}, sampled allocated peak={phase['sampled_peak']['allocated_bytes']}",flush=True)
        if not phase["complete"] or not record["sources_unchanged"]:
            break
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode",choices=["run","child"])
    parser.add_argument("phase",choices=["generate","validate"],nargs="?")
    parser.add_argument("--reference",type=Path,required=True)
    parser.add_argument("--audit",type=Path,required=True)
    parser.add_argument("--directory",type=Path)
    args = parser.parse_args()
    if args.mode=="child":
        child(args.phase,args.directory,args.reference,args.audit/"independent-validation.json")
    else:
        report=run(args.reference,args.audit)
        raise SystemExit(0 if report["complete"] else 1)
