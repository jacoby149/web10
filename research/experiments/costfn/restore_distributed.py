#!/usr/bin/env python3
"""Restore V2 on existing separate Docker-context hosts. No cloud provisioning.

Requires a synchronized, exact-source API-host checkout and private-network
firewalls. Input files are local to this controller (ideally the DB host),
downloaded from MinIO first. Import streams to the DB context before timing.
"""
import argparse
import json
import os
from pathlib import Path
import time
import urllib.request

import dataset_v2
import provenance
import restore_dataset as restore
from restore_v2 import correctness
import topology


def prepare(directory, config, receipt_path, expected_id, fixture=dataset_v2, checker=correctness, on_created=None):
    if receipt_path.exists():
        raise FileExistsError("restore receipt already exists")
    verified = fixture.validate(directory)
    if verified["dataset_id"] != expected_id:
        raise ValueError("input differs from approved dataset")
    manifest = json.loads((directory / "manifest.json").read_bytes())
    api, db = topology.commands(config, "api"), topology.commands(config, "db")
    env = topology.environment(config, os.environ)
    base = f"http://{env['COSTFN_API_IP']}:{config['api_port']}"
    started = time.monotonic()
    for command in (api, db):
        prefix = topology.docker_prefix(command)
        for kind, args in (("volume", ["volume", "ls", "-q"]), ("container", ["ps", "-aq"]), ("network", ["network", "ls", "-q"])):
            if restore.run(prefix + args + ["--filter", f"label=com.docker.compose.project={config['project']}"], env).strip():
                raise ValueError("target project already has resources; select fresh contexts/project")
    if on_created:
        on_created()
    restore.run(db + ["up", "-d", "clickhouse", "minio"], env)
    restore.wait_for(lambda: restore.ch(db, env, "SELECT 1").strip() == b"1", "remote ClickHouse")
    for template in sorted((restore.HERE.parents[2] / "clickhouse-init").glob("*.sql.template")):
        restore.wait_for(lambda p=template: restore.run(db + ["exec", "-T", "clickhouse", "clickhouse-client", "--user", "web10", "--password", "web10", "--database", "web10", "--multiquery"], env, p.read_bytes()) == b"", "remote schema")
    restore.run(api + ["up", "-d", "--no-deps", "--build", "api"], env)
    restore.wait_for(lambda: urllib.request.urlopen(base + "/docs", timeout=5).status == 200, "remote API migrations")
    restore.run(api + ["stop", "api"], env)
    baseline = restore.check_empty_target(db, env)
    baseline["app_contracts"] = int(restore.ch(db, env, "SELECT count() FROM app_contracts"))
    if baseline["app_contracts"]:
        raise ValueError("remote target contains app grants")
    for table in fixture.TABLES:
        restore.import_table(db, env, directory, table)
    counts = restore.counts(db, env, fixture.TABLES)
    if counts != {t: baseline[t] + verified["rows"][t] for t in fixture.TABLES}:
        raise ValueError("remote restore counts differ; target is partial")
    restore.run(api + ["start", "api"], env)
    restore.wait_for(lambda: urllib.request.urlopen(base + "/docs", timeout=5).status == 200, "remote restored API")
    check = checker(base, manifest)
    # Verify actual provider, not the public endpoint chosen for test traffic.
    provider = restore.run(api + ["exec", "-T", "api", "uv", "run", "python", "-c", "from app import settings; print(settings.PROVIDER)"], env).decode().strip()
    if provider != manifest["provider"]:
        raise ValueError("remote provider differs from frozen principals")
    receipt = {**verified, **config, "complete": True, "research_observer": True,
        "api": base, "counts_before": baseline, "counts_after": counts, "correctness": check,
        "preparation_seconds": time.monotonic() - started,
        "clickhouse_version": restore.ch(db, env, "SELECT version()").decode().strip(), "sources": provenance.sources()}
    with receipt_path.open("x") as output:
        json.dump(receipt, output, indent=2)
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--topology", type=Path, required=True)
    parser.add_argument("--expected-id", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.directory, json.loads(args.topology.read_bytes()), args.receipt, args.expected_id), indent=2))
