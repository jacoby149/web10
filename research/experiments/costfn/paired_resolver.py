#!/usr/bin/env python3
"""Container-only paired handler experiment. Never loaded by a serving process.

Run with docker compose exec -T api uv run python /research/paired_resolver.py.
Public manifest/options enter stdin; tokens exist only in this process memory.
"""
import hashlib
import json
import os
import random
import sys
import uuid
from unittest.mock import patch

if os.environ.get("COSTFN_DISPOSABLE") != "1":
    raise RuntimeError("requires isolated research compose stack")

from fastapi.testclient import TestClient
from app import settings
from app.v3.services import clickhouse as ch
from app.v3.services import safe_query as sq
import research_api
import core_feed
import dataset_v2


def run(manifest, pairs=20, seed=42, mode="batched"):
    if pairs < 1 or mode not in ("batched", "per-group"):
        raise ValueError("invalid paired configuration")
    if manifest["format"] != "web10-costfn-dataset-v2":
        raise ValueError("v2 manifest required")
    settings.QUERY_EVAL_NO_POLICY = False
    settings.QUERY_EVAL_STUB_EXECUTE = False
    settings.QUERY_EVAL_READABLE_MODE = mode
    resolver_name = "readable_groups_batched" if mode == "batched" else "readable_groups"
    resolver = getattr(ch, resolver_name)
    observations = []
    client = TestClient(research_api.application)
    reader = manifest["reader"]
    response = client.post("/v3/login", json={"username": reader, "password": dataset_v2.PASSWORD, "site": "costfn"})
    response.raise_for_status()
    token = response.json()["token"]
    response = client.post("/v3/groups/list", json={"token": token})
    response.raise_for_status()
    groups = [g["group_id"] for g in response.json() if g["group_id"].endswith("/followers")]
    expected = {dataset_v2.followers(dataset_v2.creator(manifest["recipe"], i)) for i in dataset_v2.followed_indices(manifest["recipe"], 0)}
    if set(groups) != expected:
        raise ValueError("pair fixture discovery mismatch")
    template = core_feed.wire()["requests"][0]["payload"]
    body = core_feed.payload(template, token, groups)
    needed = sq.query_services(body["sql"], frozenset(dataset_v2.SERVICES))
    mapping = {svc: resolver(reader, svc, True, groups) for svc in needed}

    def preauthorized(principal, service, authenticated, candidates):
        if principal != reader or not authenticated or candidates != groups or service not in mapping:
            raise ValueError("preauthorized mapping used outside exact fixed request")
        return list(mapping[service])

    class Capture(research_api.TimingCapture):
        def emit(self, record):
            super().emit(record)
            if record.msg.startswith("[query] id=%s timing_ms "):
                observations.append(dict(research_api.current.get()))

    import logging
    handler = Capture()
    logging.getLogger().addHandler(handler)
    results = []
    rng = random.Random(seed)
    compiled_sql = []
    compile_original = sq.build_safe_query

    def capture_sql(*args, **kwargs):
        value = compile_original(*args, **kwargs)
        compiled_sql.append(value)
        return value

    plan_hashes = {}
    try:
        for pair in range(pairs + 1):  # pair 0 is retained, excluded warm-up
            arms = ["live", "preauthorized"]
            rng.shuffle(arms)
            records = {}
            response_hashes = {}
            for arm in arms:
                context = patch.object(ch, resolver_name, preauthorized) if arm == "preauthorized" else patch.object(ch, resolver_name, resolver)
                before = len(observations)
                with context, patch.object(sq, "build_safe_query", capture_sql):
                    response = client.post("/v3/query", json=body,
                        headers={"Origin": dataset_v2.ORIGIN, "X-Research-ID": uuid.uuid4().hex})
                response.raise_for_status()
                if len(observations) != before + 1 or len(response.json().get("rows", [])) != 21:
                    raise ValueError("missing timing or nonempty result")
                response_hashes[arm] = hashlib.sha256(json.dumps(response.json(), sort_keys=True).encode()).hexdigest()
                records[arm] = observations[-1]
                # The handler timing log precedes ASGI response.start. The
                # copied observation's provisional 500 is not the final status.
                records[arm]["status"] = response.status_code
                if pair == 0:
                    plan = ch.client.query("EXPLAIN PLAN " + compiled_sql[-1]).result_rows
                    plan_hashes[arm] = hashlib.sha256(json.dumps(plan).encode()).hexdigest()
            if response_hashes["live"] != response_hashes["preauthorized"] or records["live"]["compiled_sha256"] != records["preauthorized"]["compiled_sha256"]:
                raise ValueError("pair output/compiled SQL mismatch; no valid overhead estimate")
            if plan_hashes.get("live") != plan_hashes.get("preauthorized"):
                raise ValueError("EXPLAIN PLAN mismatch; fixed-plan comparator is not accepted")
            results.append({"pair": pair, "warmup": pair == 0, "arm_order": arms, "arms": records,
                "equivalent_output_sha256": response_hashes["live"],
                "delta_handler_ms": records["live"]["phases_ms"]["total"] - records["preauthorized"]["phases_ms"]["total"]})
    finally:
        logging.getLogger().removeHandler(handler)
        client.close()
    return {"scope": "Paired resolver recomputation within real ASGI/handler; NOT total authorization overhead or network latency.",
        "removed": resolver_name + " recomputation only; auth/app/parse/compiler/scan/prepare retained",
        "equivalence": "exact ordered output and identical compiled SQL per pair; equal EXPLAIN PLAN hashes checked outside timing on warm-up pair",
        "explain_plan_sha256": plan_hashes,
        "mode": mode, "seed": seed, "dataset_id": manifest["dataset_id"], "pairs": results}


if __name__ == "__main__":
    options = json.load(sys.stdin)
    result = run(options["manifest"], options.get("pairs", 20), options.get("seed", 42), options.get("mode", "batched"))
    print("COSTFN_PAIRS=" + json.dumps(result), flush=True)
