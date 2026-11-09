#!/usr/bin/env python3
"""Explicitly publish only the fourteen pinned V2 synthetic input objects.

Run inside the configured production API runtime. Dry-run unless --apply.
Existing policy statements are preserved; neither listing nor writes are added.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path


BUCKET = "web10-media"
IDS = {
    "53b16c1072a8e80032b20ae23c5675040b851274ad7a314a106b7557be3b5363",
    "dbed2201952f9ca1b581c30a541e44b6912a5a6ba1bec84ee166aa80575132b4",
}
NAMES = {"manifest.json", *(f"{table}.jsonl.gz" for table in (
    "users", "documents", "doc_groups", "group_contracts", "group_members", "app_contracts"
))}
SID = "PublicFrozenSyntheticCostfnV2Inputs"


def normalized(value):
    result = json.loads(json.dumps(value))
    # MinIO reorders Resource arrays on storage; these are unordered ARN sets.
    # Do not drop fields, deduplicate resources or normalize other policy meaning.
    for statement in result.get("Statement", []):
        if isinstance(statement.get("Resource"), list):
            statement["Resource"].sort()
    return result


def digest(value):
    return hashlib.sha256(json.dumps(normalized(value), sort_keys=True).encode()).hexdigest()


def pinned_objects(receipts):
    if len(receipts) != 2 or {r["dataset_id"] for r in receipts} != IDS:
        raise ValueError("exact two approved V2 dataset receipts required")
    objects = []
    for receipt in receipts:
        prefix = f"research/costfn/datasets/{receipt['dataset_id']}/"
        if (receipt.get("bucket") != BUCKET or receipt.get("prefix") != prefix
                or receipt.get("endpoint") != "https://minio.web10.app"
                or receipt.get("complete") is not True
                or receipt.get("download_verified", {}).get("dataset_id") != receipt["dataset_id"]):
            raise ValueError("publication receipt is not an approved verified input")
        entries = receipt["objects"]
        if len(entries) != len(NAMES) or {i["key"] for i in entries} != {prefix + n for n in NAMES}:
            raise ValueError("only the seven exact published objects per input are allowed")
        for entry in entries:
            sha = entry.get("sha256", "")
            if (len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha)
                    or type(entry.get("bytes")) is not int or entry["bytes"] <= 0):
                raise ValueError("invalid pinned digest or byte count")
        objects.extend(entries)
    return sorted(objects, key=lambda entry: entry["key"])


def proposed_policy(current, objects):
    result = json.loads(json.dumps(current))
    statements = result.setdefault("Statement", [])
    if not isinstance(statements, list):
        raise ValueError("inspect non-list policy manually")
    desired = {"Sid": SID, "Effect": "Allow", "Principal": {"AWS": ["*"]},
               "Action": ["s3:GetObject"],
               "Resource": [f"arn:aws:s3:::{BUCKET}/{item['key']}" for item in objects]}
    matching = [s for s in statements if s.get("Sid") == SID]
    if matching and normalized({"Statement": matching}) != normalized({"Statement": [desired]}):
        raise ValueError("existing research policy differs; refuse to overwrite")
    if not matching:
        statements.append(desired)
    return result


def current_policy(client):
    from botocore.exceptions import ClientError
    try:
        return json.loads(client.get_bucket_policy(Bucket=BUCKET)["Policy"])
    except ClientError as error:
        if error.response["Error"]["Code"] != "NoSuchBucketPolicy":
            raise
        return {"Version": "2012-10-17", "Statement": []}


def configure(client, receipts, apply=False, backup=None):
    objects = pinned_objects(receipts)
    before = current_policy(client)
    after = proposed_policy(before, objects)
    report = {"apply_requested": apply, "bucket": BUCKET, "object_count": len(objects),
              "dataset_ids": sorted(IDS), "before_sha256": digest(before),
              "after_sha256": digest(after), "adds_only": ["s3:GetObject"],
              "wildcard_resources": False, "existing_statements_preserved": True,
              "changed": False}
    if not apply:
        print("[research-public] dry-run; no object reads or policy writes", flush=True)
        return report
    if backup is None:
        raise ValueError("exclusive before-policy backup required for apply")
    # Save rollback state on the operator's private filesystem, never in a receipt.
    with open(backup, "x", opener=lambda path, flags: os.open(path, flags, 0o600)) as output:
        json.dump(before, output)
    for index, item in enumerate(objects, 1):
        response = client.get_object(Bucket=BUCKET, Key=item["key"])
        sha, size = hashlib.sha256(), 0
        with response["Body"] as body:
            for block in iter(lambda: body.read(1024 * 1024), b""):
                size += len(block)
                if size > item["bytes"]:
                    raise ValueError("object exceeds pinned size; no policy write")
                sha.update(block)
        if size != item["bytes"] or sha.hexdigest() != item["sha256"]:
            raise ValueError("object differs from pinned publication; no policy write")
        print(f"[research-public] pinned object {index}/{len(objects)} verified", flush=True)
    if normalized(current_policy(client)) != normalized(before):
        raise ValueError("policy changed during validation; inspect before retry")
    if after != before:
        client.put_bucket_policy(Bucket=BUCKET, Policy=json.dumps(after))
        report["changed"] = True
    if normalized(current_policy(client)) != normalized(after):
        raise ValueError("policy read-back mismatch; inspect saved before-policy")
    report["authenticated_object_bytes_verified"] = sum(i["bytes"] for i in objects)
    report["policy_readback_verified"] = True
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publication", type=Path, action="append", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup", type=Path)
    args = parser.parse_args()
    from app import settings
    from app.services.media import get_s3_client
    if settings.S3_BUCKET != BUCKET:
        raise ValueError("configured bucket is not the approved publication bucket")
    print(json.dumps(configure(get_s3_client(), [json.loads(p.read_bytes()) for p in args.publication],
                               apply=args.apply, backup=args.backup), indent=2))
