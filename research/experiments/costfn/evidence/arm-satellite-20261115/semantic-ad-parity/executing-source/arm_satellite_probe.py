"""Bounded full-API Config P T2 diagnostic; not formal fresh-restore trials."""
import hashlib
import json
from pathlib import Path

import httpx

import arm_satellite_runtime as runtime
import restore_realism as restore
import smoke_realism
from arm_satellite_ad_parity import validate_main


def assess(samples, requests, observations, response_hashes):
    query_ids = [query.get("query_id") for sample in samples for query in sample["native_queries"]]
    if any(not sample["native_queries"] for sample in samples) or any(not query_id for query_id in query_ids) or len(set(query_ids)) != len(query_ids):
        return False
    ids = {record["request_id"] for record in requests}
    observed = {row["request_id"]: row for row in observations if row.get("request_id") in ids}
    stopped = any(row.get("arm_p_stop") or row.get("arm_p_native_failure") or row.get("delivery_failures") for row in observed.values())
    unsafe = any(sample["native_totals"]["exception_codes"] or any(int(q["read_rows"]) > 10_000_000 for q in sample["native_queries"]) for sample in samples)
    main_ids = {record["request_id"] for record in requests if record["kind"] == "main"}
    treated = main_ids and all(observed.get(key, {}).get("arm_p", {}).get("canonical_body_reads") is True for key in main_ids)
    return bool(len(samples) == 4 and all(sample["success"] for sample in samples) and treated
                and set(response_hashes) == main_ids and len(main_ids) == 4 and not stopped and not unsafe and ids == set(observed))


async def probe(root):
    root = Path(root)
    session = runtime.Session(root)
    session.verify_envelope()
    expected = json.loads((root / "reference/rows.json").read_bytes())
    eligible = json.loads((root / "reference/eligible-node-ads.json").read_bytes())
    if "X-Amz-Signature" in json.dumps(expected):
        raise ValueError("signed media reference needs separate semantic verification; do not ignore it")
    output = root / "serve-probe"
    markers, response_hashes, ad_checks = {}, {}, {}
    original_client, original_request = httpx.AsyncClient, smoke_realism.core_feed.request

    class Client(original_client):
        async def post(self, *args, **kwargs):
            response = await super().post(*args, **kwargs)
            request_id = (kwargs.get("headers") or {}).get("X-Research-ID")
            if request_id:
                markers[request_id] = response.headers.get("x-arm-p-stop") == "1"
            return response

    async def request(*args, **kwargs):
        try:
            result = await original_request(*args, **kwargs)
        except httpx.HTTPError:
            raise ValueError("Config P HTTP stop; no next sequence") from None
        records = args[4] if len(args) > 4 else kwargs["records"]
        kind = args[5] if len(args) > 5 else kwargs["kind"]
        request_id = records[-1]["request_id"]
        if markers.get(request_id):
            raise ValueError("Config P native/safety stop; no next sequence")
        if kind == "main":
            ad_checks[request_id] = validate_main(result.get("rows", []), expected, eligible)
            response_hashes[request_id] = hashlib.sha256(json.dumps(result["rows"], sort_keys=True).encode()).hexdigest()
        return result

    result = {"kind": "SATELLITE_CONFIG_P_FULL_API_DIAGNOSTIC", "T2": "NOT_ESTABLISHED",
              "scope": "one ordinary reader, one excluded warmup and three serial observations; not formal fresh-restore trials/p95/capacity",
              "droplet_id": session.host_id, "fanout_authorized": False, "formal_T6": "NOT_ESTABLISHED"}
    result["source_sha256"] = {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                              for name in ("arm_satellite_api.py", "arm_satellite_serve.py", "arm_satellite_probe.py",
                                           "arm_satellite_serve.compose.yml", "arm_satellite_ad_parity.py", "smoke_realism.py", "core_feed.py")}
    try:
        httpx.AsyncClient, smoke_realism.core_feed.request = Client, request
        await smoke_realism.smoke(root / "input", root / "restore.json", output)
        samples = json.loads((output / "feeds-with-native.json").read_bytes())
        requests = json.loads((output / "requests.json").read_bytes())
        env = {**session.env, "SATELLITE_SERVE_STATE": str(root / "serve-state")}
        compose = session.compose[:-2] + ["-f", str(Path(__file__).with_name("arm_satellite_serve.compose.yml")), *session.compose[-2:]]
        raw = restore.command(compose, env, "logs", "--no-log-prefix", "api").decode()
        observations = [json.loads(line.split("COSTFN_REQUEST=", 1)[1]) for line in raw.splitlines() if line.startswith("COSTFN_REQUEST=")]
        ids = {record["request_id"] for record in requests}
        observed = {row["request_id"]: row for row in observations if row.get("request_id") in ids}
        result["observations"] = list(observed.values())
        result["full_main_response_sha256"] = response_hashes
        result["semantic_ad_checks"] = ad_checks
        result["samples"] = samples
        passed = assess(samples, requests, observations, response_hashes)
        mismatch = any(sample.get("failure_class") == "semantic_failure" and not sample.get("semantic_error", "").startswith(
            ("Config P HTTP stop", "Config P native/safety stop")) for sample in samples)
        result["T2"] = "PASS" if passed else ("FAIL" if mismatch else "NOT_ESTABLISHED")
        result["outcome"] = "T2_PASS" if passed else ("INVALID_STOP" if mismatch else "STOP")
        if passed:
            result["performance_observations"] = [{"elapsed_ms": sample["completion_ms"], **sample["native_totals"]}
                                                  for sample in samples if sample["phase"] == "measured"]
            result["diagnostic_targets_met"] = all(row["elapsed_ms"] < 500 and row["read_bytes"] < 25_000_000
                                                    for row in result["performance_observations"])
    except Exception as error:
        result.update(outcome="STOP", failure_class=type(error).__name__)
        raise
    finally:
        httpx.AsyncClient, smoke_realism.core_feed.request = original_client, original_request
        output.mkdir(exist_ok=True)
        (output / "config-p.json").write_text(json.dumps(result, indent=2) + "\n")
    return result
