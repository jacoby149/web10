"""Container-only full-plan diagnostic; actual authentication and compiler, no bypass."""
import hashlib
import json
import os
import sys
import uuid
from unittest.mock import patch

if os.environ.get("COSTFN_DISPOSABLE") != "1":
    raise RuntimeError("requires owned research container")

from fastapi.testclient import TestClient
from app import settings
from app.v3.services import clickhouse as ch, safe_query as sq
import core_feed
import dataset_v2 as fixture
import matched_dates
import research_api


def run(manifest, arm):
    capture = matched_dates.capture(arm)
    if settings.QUERY_EVAL_DATE_PRUNING != (arm == "C"):
        raise ValueError("plan diagnostic arm/config mismatch")
    compiled = []
    original = sq.build_safe_query

    def observe(*args, **kwargs):
        sql = original(*args, **kwargs)
        compiled.append(sql)
        return sql

    with TestClient(research_api.application) as client:
        login = client.post("/v3/login", json={"username": manifest["reader"], "password": fixture.PASSWORD, "site": "costfn"})
        login.raise_for_status()
        token = login.json()["token"]
        discovery = client.post("/v3/groups/list", json={"token": token}, headers={"Origin": fixture.ORIGIN})
        discovery.raise_for_status()
        groups = [row["group_id"] for row in discovery.json() if row["group_id"].endswith("/followers")]
        expected = {fixture.followers(fixture.creator(manifest["recipe"], i)) for i in fixture.followed_indices(manifest["recipe"], 0)}
        if set(groups) != expected:
            raise ValueError("plan diagnostic discovery mismatch")
        body = core_feed.payload(capture["requests"][0]["payload"], token, groups)
        with patch.object(sq, "build_safe_query", observe):
            response = client.post("/v3/query", json=body, headers={"Origin": fixture.ORIGIN, "X-Research-ID": uuid.uuid4().hex})
        if not compiled:
            raise ValueError("actual registered handler did not compile the main query")
        sql = compiled[0]
        witnessed = "IN (SELECT author_key, doc_id FROM documents WHERE" in sql
        if witnessed != (arm == "C"):
            raise ValueError("full-plan candidate witness mismatch")
        plan = ch.client.query("EXPLAIN indexes=1 " + sql, settings={"max_execution_time": 10}).result_rows
    return {"arm": arm, "handler_status_outside_timing": response.status_code,
            "compiled_main_sha256": hashlib.sha256(sql.encode()).hexdigest(),
            "compiled_bytes": len(sql.encode()), "candidate_plan": witnessed,
            "full_explain": plan, "plan_sha256": hashlib.sha256(json.dumps(plan).encode()).hexdigest(),
            "scope": "Real handler/auth/compiler full plan outside timed traffic; not a policy substitution or latency sample"}


if __name__ == "__main__":
    options = json.load(sys.stdin)
    print("COSTFN_DATE_PLAN=" + json.dumps(run(options["manifest"], options["arm"])), flush=True)
