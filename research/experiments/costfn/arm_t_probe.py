"""Connected Arm T parity diagnostic, reusing the unchanged realism smoke oracle.

DigitalOcean and sequencing admission are mandatory. This is NOT the formal
three-trial/30-sample cell, a p95 estimate or permission to run K1000.
"""
import argparse
import asyncio
import json
import os
from contextlib import contextmanager
from pathlib import Path

import arm_t
import httpx


@contextmanager
def stop_on_invalid(core):
    """Single-probe process hook: stop on the API's fixed INVALID marker.

    Keep the independent row/count oracle and ordinary timeout behavior intact.
    The original request recorder has already retained status/correlation before
    this converts an INVALID HTTP response into smoke's stop-on-semantic-failure.
    """
    original = core.request

    async def request(*args, **kwargs):
        try:
            return await original(*args, **kwargs)
        except httpx.HTTPStatusError as error:
            if error.response.headers.get("x-arm-t-invalid") == "1":
                raise ValueError("Arm T INVALID; stop and inspect retained treatment receipt") from None
            raise

    core.request = request
    try:
        yield
    finally:
        core.request = original


def verdict(samples, requests, observations, snapshot):
    """Do not mistake a baseline response or HTTP failure for treated parity."""
    main_ids = {r["request_id"] for r in requests if r.get("kind") == "main"}
    observed = {r["request_id"]: r for r in observations if r.get("request_id") in main_ids}
    if not main_ids or main_ids != set(observed):
        raise ValueError("every main request needs its own Arm T observer evidence")
    for record in observed.values():
        if (record.get("arm_t", {}).get("snapshot") != snapshot
                or record["arm_t"].get("selection_cost_is_main_request_cost") is not True):
            raise ValueError("unverified/untreated API response is not Arm T parity evidence")
    if any(r["arm_t"].get("invalid_reason") for r in observed.values()):
        return "INVALID"
    if any(s.get("failure_class") == "semantic_failure" for s in samples):
        return "INVALID"
    if (len(samples) != 4 or any(not s.get("success") or not s.get("exact_projected_rows")
                               or not s.get("exact_followups") for s in samples)):
        return "NOT_ESTABLISHED"
    return "PASS"


async def probe(directory, restored_path, build_path, admission_path, output):
    import restore_realism as restore
    import smoke_realism

    host = arm_t.digitalocean_id()
    arm_t.admission(admission_path, host)
    built = arm_t.read_build(build_path)
    arm_t.runtime_admission(built, admission_path, host)
    restored = json.loads(Path(restored_path).read_bytes())
    if (built["droplet_id"] != host or built["project"] != restored["project"]
            or built["restore_sha256"] != arm_t.digest(restored_path)):
        raise ValueError("Arm T parity probe requires the same own host/store/restore")
    output = Path(output)
    if output.exists():
        raise FileExistsError("keep every Arm T parity iteration; fresh output directory required")
    result = {"kind": "ADDITIVE_ARM_T_PARITY_PROBE", "dataset_id": arm_t.DATASET,
              "build_receipt_sha256": built["receipt_sha256"], "parity": "NOT_ESTABLISHED",
              "scope": "One ordinary-reader serial diagnostic, not formal trials, p95 or capacity",
              "formal_cell_complete": False}
    try:
        with stop_on_invalid(smoke_realism.core_feed):
            await smoke_realism.smoke(directory, restored_path, output)
        samples = json.loads((output / "feeds-with-native.json").read_bytes())
        requests = json.loads((output / "requests.json").read_bytes())
        compose = restore.commands(restored["project"], restored["api_port"], restored["overlay"])
        env = {**os.environ, "API_PORT": str(restored["api_port"]),
               "COSTFN_RESEARCH_DIR": str(arm_t.HERE), "COSTFN_REPO_DIR": str(arm_t.HERE.parents[2])}
        # Inspect only the observer's allowlisted metadata, not arbitrary logs.
        raw = restore.command(compose, env, "logs", "--no-log-prefix", "api").decode()
        observed = [json.loads(line.split("COSTFN_REQUEST=", 1)[1]) for line in raw.splitlines()
                    if line.startswith("COSTFN_REQUEST=")]
        result["parity"] = verdict(samples, requests, observed, built["receipt_sha256"])
        result["native_sequence_totals"] = [{"phase": s["phase"], "success": s["success"],
                                             **s["native_totals"]} for s in samples]
        result["cost_scope"] = "Entire serial sequence, including in-request candidate and verification reads"
        result["next_gate"] = "Stop on INVALID; otherwise formal fresh-restore three-trial K20 cell remains OPEN"
    except Exception as error:
        result["failure_class"] = type(error).__name__
        raise
    finally:
        output.mkdir(exist_ok=True, parents=True)
        with (output / "arm-t-parity.json").open("x") as stream:
            json.dump(result, stream, indent=2)
            stream.write("\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--restore", type=Path, required=True)
    parser.add_argument("--build", type=Path, required=True)
    parser.add_argument("--admission", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = asyncio.run(probe(args.directory, args.restore, args.build, args.admission, args.out))
    raise SystemExit(0 if result["parity"] == "PASS" else 1)
