#!/usr/bin/env python3
"""Immutable MinIO/S3 publication and verified download. No bucket-policy writes."""
import argparse
import hashlib
import json
from pathlib import Path
import re

import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

import dataset
import dataset_v2


def fixture_for(manifest):
    if manifest.get("format") == "web10-costfn-dataset-v2":
        return dataset_v2
    if manifest.get("format") == "web10-costfn-dataset-v1":
        return dataset
    raise ValueError("unknown dataset format")


def prefix_for(prefix, dataset_id):
    if not re.fullmatch(r"[a-f0-9]{64}", dataset_id) or not re.fullmatch(r"research/[a-z0-9/_-]+", prefix) or "//" in prefix:
        raise ValueError("use an explicit research-only prefix and pinned SHA-256 dataset identity")
    return prefix.rstrip("/") + "/" + dataset_id + "/"


def remote_digest(client, bucket, key):
    try:
        response = client.get_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        if str(exc.response["Error"]["Code"]) in ("NoSuchKey", "404"):
            return None
        raise
    digest = hashlib.sha256()
    with response["Body"] as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def publish(client, bucket, prefix, directory, approved_id):
    manifest = json.loads((directory / "manifest.json").read_bytes())
    verified = fixture_for(manifest).validate(directory)
    if verified["dataset_id"] != approved_id:
        raise ValueError("publication dataset differs from approved identity")
    target = prefix_for(prefix, approved_id)
    uploaded = []
    # Manifest is the last commit marker. Conditional writes prevent replacement.
    names = [*(i["name"] for i in manifest["files"].values()), "manifest.json"]
    existing_objects = {}
    for name in names:
        existing_objects[name] = remote_digest(client, bucket, target + name)
        if existing_objects[name] is not None and existing_objects[name] != dataset.digest(directory / name):
            raise ValueError("immutable destination contains different bytes")
    for name in names:
        path = directory / name
        wanted = dataset.digest(path)
        existing = existing_objects[name]
        if existing is not None and existing != wanted:
            raise ValueError("immutable destination contains different bytes")
        if existing is None:
            try:
                with path.open("rb") as stream:
                    client.put_object(Bucket=bucket, Key=target + name, Body=stream,
                                      ContentLength=path.stat().st_size, IfNoneMatch="*",
                                      ContentType="application/json" if name.endswith(".json") else "application/gzip")
            except ClientError as exc:
                if str(exc.response["Error"]["Code"]) not in ("PreconditionFailed", "412", "ConditionalRequestConflict", "409"):
                    raise
            if remote_digest(client, bucket, target + name) != wanted:
                raise ValueError("uploaded bytes differ; publication is incomplete")
        uploaded.append({"key": target + name, "sha256": wanted, "bytes": path.stat().st_size})
        print(f"[dataset-store] verified object {len(uploaded)}/{len(manifest['files']) + 1}", flush=True)
    return {"dataset_id": approved_id, "bucket": bucket, "prefix": target, "objects": uploaded,
            "complete": True, "public_policy_changed": False, "verification": "full authenticated object reads, not ETag inference"}


def download(client, bucket, prefix, directory, approved_id):
    target = prefix_for(prefix, approved_id)
    directory.mkdir(parents=True, exist_ok=False)
    manifest_response = client.get_object(Bucket=bucket, Key=target + "manifest.json")
    with manifest_response["Body"] as stream:
        raw = stream.read(16 * 1024 * 1024 + 1)
    if len(raw) > 16 * 1024 * 1024:
        raise ValueError("manifest exceeds size bound")
    manifest = json.loads(raw)
    fixture = fixture_for(manifest)
    if manifest.get("dataset_id") != approved_id or dataset.identity(manifest) != approved_id or set(manifest["files"]) != set(fixture.TABLES):
        raise ValueError("download does not match independently pinned identity")
    (directory / "manifest.json").write_bytes(raw)
    for table, info in manifest["files"].items():
        name = f"{table}.jsonl.gz"
        if info["name"] != name or not 0 < info["bytes"] <= 5 * 1024**3:
            raise ValueError("unrecognized file name/size")
        response = client.get_object(Bucket=bucket, Key=target + name)
        size = 0
        digest = hashlib.sha256()
        with response["Body"] as stream, (directory / name).open("xb") as output:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                size += len(block)
                if size > info["bytes"]:
                    raise ValueError("download exceeds pinned size")
                digest.update(block)
                output.write(block)
        if size != info["bytes"] or digest.hexdigest() != info["sha256"]:
            raise ValueError("download integrity mismatch")
    return fixture.validate(directory)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["publish", "download"])
    parser.add_argument("directory", type=Path)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--expected-id", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    from urllib.parse import urlsplit
    url = urlsplit(args.endpoint)
    if url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise ValueError("endpoint must be a bare storage origin without credentials")
    if url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("127.0.0.1", "localhost")):
        raise ValueError("TLS required except disposable loopback MinIO")
    if args.receipt.exists():
        raise FileExistsError("refusing to replace publication/download receipt")
    # Standard AWS credential chain; never print or serialize it.
    client = boto3.client("s3", endpoint_url=args.endpoint,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}, retries={"max_attempts": 3}))
    result = (publish if args.command == "publish" else download)(client, args.bucket, args.prefix, args.directory, args.expected_id)
    with args.receipt.open("x") as output:
        json.dump({**result, "endpoint": args.endpoint}, output, indent=2)
